# Property Pal

This is a property inventory app for Elle Inventory Solutions, replacing manual photo upload, dictation and typing with an AI-assisted Inventory / Check In / Check Out / Update pipeline.

Set up a Supabase backend with the following tables:

- properties: id, address, postcode, client_name (e.g. letting agent), exterior_photo_url, status (enum: "Inventory Pending", "Awaiting Check In", "In Tenancy", "Check Out Booked", "Check Out Complete"), created_at

- reports: id, property_id (fk), report_type (enum: "Inventory", "Check In", "Check Out", "Update"), previous_report_id (fk to reports, nullable — points to whichever report this one was built from), created_at, status (draft/complete)

- rooms: id, report_id (fk), name, sort_order

- wide_shots: id, room_id (fk), photo_url, sort_order

- items: id, room_id (fk, nullable — null means unallocated), photo_url, item_name, description, condition, check_in_comment, check_out_comment, update_comment, source (enum: "ai", "manual"), edited (boolean)

- brains: id, report_type, prompt_content, version, updated_at

Set row-level security so only the authenticated user can read/write their own properties and reports.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://elleinventorysolutions.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/be4cad62-4163-4f40-8a46-21997d6fe543).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
