-- =====================================================================
-- AUSWAY — Final Supabase schema (drop & recreate)
-- Run in Supabase Dashboard → SQL Editor → New query → Run
-- =====================================================================
-- WARNING: this DROPS user_profiles, driver_profiles and bookings and
-- everything in them. Fine for dev; back up first if you have real data.
-- =====================================================================

drop table if exists public.bookings        cascade;
drop table if exists public.driver_profiles cascade;
drop table if exists public.user_profiles   cascade;

create extension if not exists "pgcrypto";

-- =====================================================================
-- USER PROFILES
-- id = auth.uid() — the User app already does this correctly
-- (see register.dart's ProfileSavePage: `'id': user.id`).
-- =====================================================================
create table public.user_profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    first_name  text not null,
    last_name   text not null,
    phone       text unique,
    email       text unique,
    latitude    double precision,
    longitude   double precision,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- =====================================================================
-- DRIVER PROFILES
-- id = auth.uid() too, now that the Driver app's login/signup screen
-- has been fixed to match the User app's pattern instead of using a
-- self-generated id (that mismatch — writing a random id that never
-- matched auth.uid() — was quietly breaking RLS-protected writes and
-- causing the "half-null" rows).
--
-- profile_completed can only become true once driver_name, ambulance
-- type, and EITHER a vehicle_number (own vehicle) OR an agency_name
-- (agency-affiliated) are present — enforced by Postgres itself, not
-- just app logic.
-- =====================================================================
create table public.driver_profiles (
    id                  uuid primary key references auth.users(id) on delete cascade,
    phone               text unique,
    driver_name         text,
    emergency_contact   text,          -- collected on the registration form,
                                        -- previously gathered by the app and
                                        -- silently thrown away before saving
    address             text,          -- "House / Street" line, same story
    city                text,
    pincode             text,
    ambulance_type      text,          -- must exactly match what the User app
                                        -- sends when booking (BLS/ALS/Bike/Neonatal)
    vehicle_number      text,          -- own-vehicle drivers
    agency_name         text,          -- agency-affiliated drivers
    agency_number       text,
    agency_address      text,
    agency_city         text,
    agency_pincode      text,
    agency_vehicle_count int,
    agency_driver_count  int,
    registration_type  text check (registration_type in ('own','agency')),
    profile_image       text,
    driving_license     text,
    aadhar_card         text,
    profile_completed   boolean not null default false,
    is_online           boolean not null default false,
    current_latitude    double precision,
    current_longitude   double precision,
    last_seen           timestamptz,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now(),

    constraint driver_profile_complete_requires_details check (
        profile_completed = false
        or (
            driver_name is not null and driver_name <> ''
            and ambulance_type is not null and ambulance_type <> ''
            and (
                (vehicle_number is not null and vehicle_number <> '')
                or (agency_name is not null and agency_name <> '')
            )
        )
    )
);

-- =====================================================================
-- BOOKINGS
-- =====================================================================
create table public.bookings (
    id              uuid primary key default gen_random_uuid(),
    booking_ref     text not null unique,
    user_id         uuid not null references public.user_profiles(id) on delete cascade,
    driver_id       uuid not null references public.driver_profiles(id)
                        on delete cascade on update cascade,
    ambulance_type  text not null,
    pickup_lat      double precision not null,
    pickup_lng      double precision not null,
    pickup_address  text,
    dest_lat        double precision,
    dest_lng        double precision,
    dest_address    text,
    status          text not null default 'PENDING'
                        check (status in ('PENDING','ACCEPTED','REJECTED','COMPLETED','CANCELLED')),
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);

create index idx_bookings_user_id   on public.bookings(user_id);
create index idx_bookings_driver_id on public.bookings(driver_id);
create index idx_bookings_status    on public.bookings(status);

-- =====================================================================
-- Auto-update updated_at
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger trg_user_profiles_updated_at
    before update on public.user_profiles
    for each row execute function public.set_updated_at();

create trigger trg_driver_profiles_updated_at
    before update on public.driver_profiles
    for each row execute function public.set_updated_at();

create trigger trg_bookings_updated_at
    before update on public.bookings
    for each row execute function public.set_updated_at();

-- =====================================================================
-- ROW LEVEL SECURITY — enabled, with real policies
-- =====================================================================
-- Your server (AUSWAY_SERVER) must use the SERVICE ROLE key (see
-- config/supabase.js + .env) so it bypasses these policies entirely —
-- it legitimately needs cross-user/cross-driver access. The Flutter
-- apps keep using the anon key + each signed-in user's own session,
-- which is exactly what these policies are designed for.
-- =====================================================================

alter table public.user_profiles   enable row level security;
alter table public.driver_profiles enable row level security;
alter table public.bookings        enable row level security;

-- A user can read/write only their own row.
create policy "user can manage own profile"
    on public.user_profiles
    for all
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- A driver can read/write only their own row. Riders also need to be
-- able to READ (not write) the assigned driver's public info once a
-- booking is accepted (name/phone/vehicle) — handled via the server's
-- service-role key for the accept-booking push, so no extra policy is
-- needed here for that.
create policy "driver can manage own profile"
    on public.driver_profiles
    for all
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- A rider can see/manage their own bookings; a driver can see/manage
-- bookings assigned to them.
create policy "participants can view their bookings"
    on public.bookings
    for select
    using (auth.uid() = user_id or auth.uid() = driver_id);

create policy "rider can create their own booking"
    on public.bookings
    for insert
    with check (auth.uid() = user_id);

create policy "participants can update their bookings"
    on public.bookings
    for update
    using (auth.uid() = user_id or auth.uid() = driver_id)
    with check (auth.uid() = user_id or auth.uid() = driver_id);

-- =====================================================================
-- LOGIN / SIGN-UP HELPER FUNCTIONS
-- =====================================================================
-- Both the Login and Sign-up screens need to check "does this phone
-- number already have a driver_profiles row?" BEFORE the driver is
-- signed in. But the RLS policy above only allows a row's own owner
-- (auth.uid() = id) to read it — an unauthenticated / not-yet-verified
-- request has no matching uid, so a plain
--   supabase.from('driver_profiles').select().eq('phone', x)
-- silently returns nothing every time, no matter what's really in the
-- table. That was the actual cause of "Send OTP" and "Sign up" both
-- behaving unpredictably. These two SECURITY DEFINER functions run
-- with elevated privilege internally but only ever expose the small,
-- non-sensitive fields the screens actually need — never the full row.
-- =====================================================================

-- LOGIN screen: "does this phone exist, and if so what's on record?"
create or replace function public.check_driver_phone(p_phone text)
returns table (
    id                uuid,
    driver_name       text,
    ambulance_type    text,
    profile_completed boolean
)
language sql
security definer
set search_path = public
as $$
    select id, driver_name, ambulance_type, profile_completed
    from public.driver_profiles
    where phone = p_phone;
$$;

grant execute on function public.check_driver_phone(text) to anon, authenticated;

-- LOGIN screen, right after OTP verification succeeds: the driver has
-- just proven (via a real SMS OTP) that they own this phone number.
-- Because Sign-up now uses an anonymous session (no OTP) rather than a
-- phone-linked one, the row's original id may not equal the uid this
-- login just authenticated as. This reassigns the row's id to the
-- current session's uid so `auth.uid() = id` (and every RLS policy
-- built on it) keeps working from here on, on whichever device the
-- driver is currently logging in from. It only ever touches the one
-- row matching p_phone, and only after Supabase Auth itself has
-- already verified the OTP for that phone.
create or replace function public.claim_driver_profile(p_phone text, p_new_id uuid)
returns table (
    id                uuid,
    driver_name       text,
    ambulance_type    text
)
language plpgsql
security definer
set search_path = public
as $$
begin
    update public.driver_profiles
       set id = p_new_id
     where phone = p_phone
       and id <> p_new_id;

    return query
        select dp.id, dp.driver_name, dp.ambulance_type
        from public.driver_profiles dp
        where dp.phone = p_phone;
end;
$$;

grant execute on function public.claim_driver_profile(text, uuid) to anon, authenticated;

-- =====================================================================
-- Sanity checks
-- =====================================================================
-- select * from public.user_profiles   order by created_at desc limit 5;
-- select * from public.driver_profiles order by created_at desc limit 5;
-- select * from public.bookings        order by created_at desc limit 5;
