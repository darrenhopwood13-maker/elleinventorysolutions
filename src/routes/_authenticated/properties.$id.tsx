import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/properties/$id")({
  component: PropertyLayout,
});

function PropertyLayout() {
  return <Outlet />;
}