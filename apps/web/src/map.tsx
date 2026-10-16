import { useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import { Link } from 'react-router-dom';
import type { Facility } from '@larosentry/contracts';
import 'leaflet/dist/leaflet.css';
export default function FacilityMap({ facilities }: { facilities: Facility[] }) {
  const [failed, setFailed] = useState(false);
  return (
    <>
      <p className="notice small">
        Map locations are approximate; demonstration facilities use fictional coordinates. Map tiles are
        provided by OpenStreetMap; list browsing remains available above.
      </p>
      {failed && (
        <p className="notice error" role="status">
          Map tiles failed to load. Use List view to continue browsing.
        </p>
      )}
      <MapContainer center={[14.66, 121.05]} zoom={12} scrollWheelZoom={false} className="facility-map">
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          eventHandlers={{ tileerror: () => setFailed(true) }}
        />
        {facilities.map((f) => (
          <CircleMarker
            center={[f.latitude, f.longitude]}
            key={f.id}
            radius={9}
            pathOptions={{ color: '#fff', fillColor: '#267958', fillOpacity: 1 }}
          >
            <Popup>
              <strong>{f.name}</strong>
              <p>{f.area} · Fictional demo</p>
              <Link to={`/facilities/${f.slug}`}>View courts</Link>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </>
  );
}
