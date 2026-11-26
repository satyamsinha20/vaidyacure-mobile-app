import AdminFrame from "@/components/app/AdminFrame";

/** Every admin page shares this frame, so the top bar and sidebar stay while pages change */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminFrame>{children}</AdminFrame>;
}
