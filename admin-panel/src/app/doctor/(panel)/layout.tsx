import DoctorFrame from "@/components/doctor/DoctorFrame";

/** Every doctor panel page shares this frame, so the top bar and menu stay while pages change */
export default function DoctorPanelLayout({ children }: { children: React.ReactNode }) {
  return <DoctorFrame>{children}</DoctorFrame>;
}
