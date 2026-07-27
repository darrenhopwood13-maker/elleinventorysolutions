
-- Enums
CREATE TYPE public.property_status AS ENUM ('Inventory Pending', 'Awaiting Check In', 'In Tenancy', 'Check Out Booked', 'Check Out Complete');
CREATE TYPE public.report_type AS ENUM ('Inventory', 'Check In', 'Check Out', 'Update');
CREATE TYPE public.report_status AS ENUM ('draft', 'complete');
CREATE TYPE public.item_source AS ENUM ('ai', 'manual');

-- Properties
CREATE TABLE public.properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  postcode TEXT NOT NULL,
  client_name TEXT,
  exterior_photo_url TEXT,
  status public.property_status NOT NULL DEFAULT 'Inventory Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX properties_user_id_idx ON public.properties(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.properties TO authenticated;
GRANT ALL ON public.properties TO service_role;
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own properties" ON public.properties FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Reports
CREATE TABLE public.reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  report_type public.report_type NOT NULL,
  previous_report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  status public.report_status NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX reports_property_id_idx ON public.reports(property_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own reports" ON public.reports FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = reports.property_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.properties p WHERE p.id = reports.property_id AND p.user_id = auth.uid()));

-- Rooms
CREATE TABLE public.rooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX rooms_report_id_idx ON public.rooms(report_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rooms TO authenticated;
GRANT ALL ON public.rooms TO service_role;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own rooms" ON public.rooms FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r JOIN public.properties p ON p.id = r.property_id WHERE r.id = rooms.report_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r JOIN public.properties p ON p.id = r.property_id WHERE r.id = rooms.report_id AND p.user_id = auth.uid()));

-- Wide shots
CREATE TABLE public.wide_shots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX wide_shots_room_id_idx ON public.wide_shots(room_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wide_shots TO authenticated;
GRANT ALL ON public.wide_shots TO service_role;
ALTER TABLE public.wide_shots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wide_shots" ON public.wide_shots FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.rooms rm JOIN public.reports r ON r.id = rm.report_id JOIN public.properties p ON p.id = r.property_id WHERE rm.id = wide_shots.room_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.rooms rm JOIN public.reports r ON r.id = rm.report_id JOIN public.properties p ON p.id = r.property_id WHERE rm.id = wide_shots.room_id AND p.user_id = auth.uid()));

-- Items
CREATE TABLE public.items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  photo_url TEXT,
  item_name TEXT,
  description TEXT,
  condition TEXT,
  check_in_comment TEXT,
  check_out_comment TEXT,
  update_comment TEXT,
  source public.item_source NOT NULL DEFAULT 'ai',
  edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX items_room_id_idx ON public.items(room_id);
CREATE INDEX items_report_id_idx ON public.items(report_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.items TO authenticated;
GRANT ALL ON public.items TO service_role;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own items" ON public.items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.reports r JOIN public.properties p ON p.id = r.property_id WHERE r.id = items.report_id AND p.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.reports r JOIN public.properties p ON p.id = r.property_id WHERE r.id = items.report_id AND p.user_id = auth.uid()));

-- Brains (shared prompt library)
CREATE TABLE public.brains (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_type public.report_type NOT NULL,
  prompt_content TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brains TO authenticated;
GRANT ALL ON public.brains TO service_role;
ALTER TABLE public.brains ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read brains" ON public.brains FOR SELECT TO authenticated USING (true);

-- Trigger to keep brains.updated_at fresh
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER brains_touch_updated_at BEFORE UPDATE ON public.brains
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
