# Alvys TMS integration — plan

Status: scaffolding ready (`backend/app/alvys_client.py`, config vars). Blocked on
`ALVYS_CLIENT_ID` / `ALVYS_CLIENT_SECRET` from the customer's Alvys Admin.

Follows the same architecture as Samsara: a background job pulls Alvys into our
Postgres; the dashboard and AI agent read only from the DB (never Alvys live in a
request). Read-only to start.

## When creds arrive (first steps)
1. Put `ALVYS_CLIENT_ID` / `ALVYS_CLIENT_SECRET` in `.env`.
2. Verify the live API like we did for Samsara: token flow, then probe
   `/loads`, `/trips`, `/drivers`, `/trucks` — confirm real paths, pagination,
   and response fields. Fix `alvys_client.py` placeholders accordingly.

## New tables (add to models.py, then `alembic revision --autogenerate`)
- **loads**: `id` (Alvys load id, PK), `reference_number`, `status`,
  `customer`, `pickup_location`, `pickup_time`, `delivery_location`,
  `delivery_time`, `rate`, `vehicle_id` (our Samsara vehicle id, FK, nullable),
  `driver_name`, `raw` (JSON), `updated_at`.
- **trips** (optional, if loads aren't enough): `id`, `load_id` (FK), `vehicle_id`,
  `driver_name`, `start_time`, `end_time`, `status`, `raw`.

## Linking a load/trip to a truck
Alvys and Samsara are already integrated on the customer's side, so an Alvys
trip/load should reference the Samsara vehicle. Matching strategy (verify):
1. If Alvys returns the Samsara vehicle id directly → use it.
2. Else match Alvys truck `externalIds` (VIN / Samsara serial) to our
   `Vehicle.details.vin` / serial.

## Dashboard / agent surface
- New **"Loads"** tab: list of active loads (reference, status, pickup → delivery,
  ETA), click a load → truck on map.
- Truck detail / map popup: show the truck's current load ("from → to") — this
  finally fills the real origin→destination we currently approximate with heading.
- Agent: read loads from DB → answer "what's truck 128 hauling / when's delivery".

## Later (phase 2+)
- Write-back to Alvys (update load status) via a controlled tool/job (not the
  live agent).
- Gradually move dispatch/tracking into our UI (strangler approach) — see chat
  history for the full "replace Alvys over time" strategy.
