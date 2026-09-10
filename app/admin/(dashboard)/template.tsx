/**
 * Re-mounted on every navigation inside the portal, so each page arrives
 * with the same short entrance instead of snapping into place.
 */
export default function PortalTemplate({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>
}
