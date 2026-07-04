export default function Stub({ title }) {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <div className="card" style={{ padding: '54px 40px', textAlign: 'center' }}>
        <div className="ff" style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>{title}</div>
        <div style={{ fontSize: 13, color: 'var(--tx3)', maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>Раздел появится на следующем этапе. Каркас, данные и роли уже подключены — наполняем по слоям.</div>
      </div>
    </div>
  )
}
