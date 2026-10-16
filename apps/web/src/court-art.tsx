export function CourtArt({ sport = 'Basketball', hero = false }: { sport?: string; hero?: boolean }) {
  const tennis = ['Tennis', 'Badminton', 'Pickleball'].includes(sport);
  return (
    <svg
      className={`court-art ${hero ? 'hero-art' : ''}`}
      viewBox="0 0 680 450"
      role="img"
      aria-label={`${sport} court illustration, not a facility photograph`}
    >
      <defs>
        <pattern id={`grain-${hero}-${sport}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r=".6" fill="#fff" opacity=".1" />
        </pattern>
      </defs>
      <rect width="680" height="450" fill={tennis ? '#204842' : '#345555'} />
      <path d="M0 340L680 210V450H0Z" fill="#122f32" opacity=".4" />
      <path d="M530 0L680 0V450L390 450Z" fill="#e3cf97" opacity=".07" />
      <g transform="translate(68 24) rotate(-11 280 210)">
        <rect x="22" y="26" width="520" height="355" rx="3" fill={tennis ? '#749279' : '#b37051'} />
        <rect x="55" y="57" width="454" height="293" fill={tennis ? '#396b5e' : '#d69b76'} />
        <g fill="none" stroke="#fff3d7" strokeWidth="3" opacity=".87">
          <path d="M55 57H509V350H55Z M282 57V350" />
          <circle cx="282" cy="203.5" r="40" />
          {tennis ? (
            <>
              <path d="M55 95H509M55 312H509M170 95V312M394 95V312M170 204H394" />
              <path d="M282 45V365" strokeWidth="6" />
            </>
          ) : (
            <>
              <path d="M55 133H135V274H55M509 133H429V274H509" />
              <path d="M55 83C259 90 259 316 55 325M509 83C305 90 305 316 509 325" />
              <path d="M135 166A40 40 0 0 1 135 242M429 166A40 40 0 0 0 429 242" />
              <circle cx="81" cy="204" r="8" />
              <circle cx="482" cy="204" r="8" />
            </>
          )}
        </g>
        <path d="M0 386H560" stroke="#203b38" strokeWidth="13" />
        <path d="M12 401H553" stroke="#8a9f88" strokeWidth="5" />
      </g>
      <rect width="680" height="450" fill={`url(#grain-${hero}-${sport})`} />
      <g fill="#9cab7b">
        <circle cx="30" cy="36" r="65" />
        <circle cx="658" cy="421" r="70" />
      </g>
      <g fill="#6a865f">
        <circle cx="8" cy="18" r="53" />
        <circle cx="680" cy="445" r="55" />
      </g>
      <circle cx="360" cy="266" r="8" fill="#f3ead7" />
      <ellipse cx="370" cy="276" rx="15" ry="5" fill="#273e3b" opacity=".3" />
      <circle cx="410" cy="108" r="7" fill="#183f46" />
    </svg>
  );
}
