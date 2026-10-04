import NaviMascot from "@/components/brand/NaviMascot";
export default function Loading() {
  return (
    <main className="empty planning-status" role="status">
      <NaviMascot state="thinking" size={96} />
      <p>Finding date ideas…</p>
    </main>
  );
}
