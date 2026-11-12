import { useId } from 'react'
import { useTranslations } from '../i18n'

export type MascotPose = 'smirk' | 'navigate' | 'file' | 'cool' | 'guard' | 'power' | 'confused' | 'peace'

const HEAD = 'M31 88 21 80 32 75 25 19 67 43 79 35 78 42 100 35 111 40 126 33 124 43 180 23 169 75 182 81 172 89 186 94 169 101 178 108 161 114 165 125 144 127 Q99 150 55 129 L37 131 41 118 24 116 32 105 17 101Z'
const BODY = 'M65 128 58 144 65 145 53 162 60 161 48 187 58 184 52 205 Q97 219 152 205 L146 190 155 192 146 167 151 170 140 145 145 146 133 127Z'
const EYES = {
  smug: ['M47 86 87 96 Q79 118 61 109 49 103 47 86Z', 'M112 96 153 84 Q150 110 131 110 118 108 112 96Z'],
  tired: ['M47 96 87 99 Q81 118 62 112 51 109 47 96Z', 'M112 100 153 94 Q148 115 130 113 119 111 112 100Z'],
  alert: ['M47 87 87 99 Q80 119 62 109 51 104 47 87Z', 'M112 99 153 87 Q149 111 132 111 119 110 112 99Z'],
  curious: ['M48 90 Q67 80 86 92 Q87 119 65 116 48 113 48 90Z', 'M113 96 153 86 Q150 111 132 112 119 111 113 96Z']
}

/** Sharp vector silhouettes, clipped pupils and theme-adaptive glitch colors. */
export function TourMascot({ pose = 'smirk' }: { pose?: MascotPose }) {
  const id = useId().replace(/:/g, '')
  const t = useTranslations('app')
  const tired = pose === 'peace'
  const eyes = EYES[pose === 'confused' ? 'curious' : pose === 'guard' || pose === 'power' ? 'alert' : tired || pose === 'navigate' ? 'tired' : 'smug']
  const tilt = pose === 'confused' ? 9 : pose === 'smirk' ? -6 : pose === 'navigate' ? -4 : tired ? 5 : 0
  return <svg viewBox="0 0 200 220" className="tour-mascot" data-pose={pose} aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-fur`} x1="0" y1="0" x2=".8" y2="1"><stop className="tour-fur-top" /><stop offset="1" className="tour-fur-bottom" /></linearGradient>
      <linearGradient id={`${id}-ear`} x2="1" y2="1"><stop stopColor="var(--mascot-glitch)" /><stop offset=".55" stopColor="currentColor" /><stop offset="1" stopColor="var(--mascot-fur-bottom)" /></linearGradient>
      <pattern id={`${id}-noise`} width="43" height="37" patternUnits="userSpaceOnUse">
        <path d="M0 4h18m9 2h12M8 19h27m-6 3h14M0 33h11" stroke="currentColor" strokeWidth=".6" opacity=".22" />
        <path d="M4 6h7v2H4zm22 20h10v2H26z" fill="var(--mascot-glitch)" opacity=".22" />
        <text x="8" y="15" fontSize="5" fontFamily="monospace" fill="currentColor" opacity=".18">0101</text>
      </pattern>
      <pattern id={`${id}-scan`} width="4" height="3" patternUnits="userSpaceOnUse"><path d="M0 0h4" stroke="var(--mascot-ink)" opacity=".13" strokeWidth=".5" /></pattern>
      <clipPath id={`${id}-head`}><path d={HEAD} /></clipPath>
      <clipPath id={`${id}-body`}><path d={BODY} /></clipPath>
      {eyes.map((d, i) => <clipPath key={i} id={`${id}-eye-${i}`}><path d={d} /></clipPath>)}
    </defs>
    <ellipse cx="103" cy="213" rx="79" ry="5" fill="currentColor" opacity=".12" />
    <path d={tired ? 'M146 201Q187 214 185 184L179 176 173 183Q182 206 151 190Z' : 'M148 198Q194 201 187 161L179 149 183 143 168 152 174 168Q184 190 150 183Z'} fill={`url(#${id}-fur)`} stroke="var(--mascot-edge)" strokeWidth="2" />
    <path d="m177 161 9 3m-10 2 11 3" stroke="var(--mascot-glitch)" strokeWidth="2" />
    <g transform={tired ? 'rotate(4 100 180)' : undefined}>
      <path d={BODY} fill={`url(#${id}-fur)`} stroke="var(--mascot-edge)" strokeWidth="2" />
      <path d={BODY} fill={`url(#${id}-noise)`} />
      <g clipPath={`url(#${id}-body)`}>
        <path d="m61 140 20 7-12 11 28-8-11 17 21-12 25 14-5-17 23 8" fill="var(--mascot-paws)" opacity=".7" />
        <path d="M50 183h27v3H47m94-20h17v4h-24M57 202h23v2H55" fill="currentColor" opacity=".7" />
        <path d="M63 150h9m40 44h24m-60 6h12" stroke="var(--mascot-glitch)" strokeWidth="2" />
      </g>
      {pose !== 'navigate' && <g>
        <path d="M62 176Q54 180 53 201L50 207Q64 217 85 210L86 190 78 177 74 182 70 174Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
        <path d="M124 184 131 175 136 180 140 176Q152 184 150 202L154 207Q140 217 119 210Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
        <path d="m62 201-1 8m9-7v9m62-10-1 8m9-7 1 9" stroke="var(--mascot-edge)" strokeWidth="1.3" opacity=".65" />
      </g>}
    </g>
    <g transform={`${pose === 'navigate' ? 'translate(0 7) ' : ''}rotate(${tilt} 100 98)`}>
      <path d={HEAD} transform="translate(-1.8 1)" fill="none" stroke="var(--mascot-glitch)" strokeWidth="2.3" opacity=".75" />
      <path d={HEAD} transform="translate(1.6 -.6)" fill="none" stroke="currentColor" strokeWidth="2.2" opacity=".8" />
      <path d={HEAD} fill={`url(#${id}-fur)`} stroke="var(--mascot-edge)" strokeWidth="1.6" />
      <path d="m32 29 30 22-25 16zm139 4-34 20 27 15z" fill={`url(#${id}-ear)`} />
      <path d="m33 31 5 31 12-9m118-18-5 29-11-9" stroke="var(--mascot-eye-white)" strokeWidth="1.3" fill="none" opacity=".7" />
      <g clipPath={`url(#${id}-head)`}>
        <path d={HEAD} fill={`url(#${id}-noise)`} />
        <path d="M20 56h24v4H20m-2 28h29v3H18m136-39h31v4h-27m-4 52h30v3h-30M30 113h27v4H28M91 39h16v3H91" fill="currentColor" opacity=".8" />
        <path d="M27 62h18m-20 2h8m124-5h19m-23 38h29m-29 3h13M29 118h20" stroke="var(--mascot-glitch)" strokeWidth="2.1" />
        <path d="m41 42 7 5-6 4 12 5-14 4m124-10-10 5 10 4-13 3" fill="var(--mascot-eye-white)" opacity=".6" />
      </g>
      {eyes.map((d, i) => <g key={i}>
        <path d={d} fill="var(--mascot-eye-white)" stroke="var(--mascot-ink)" strokeWidth="2" />
        <g clipPath={`url(#${id}-eye-${i})`}>
          <ellipse cx={i ? 132 : 72} cy="98" rx="8" ry="14" fill="currentColor" />
          <ellipse cx={i ? 133 : 73} cy="98" rx="2.8" ry="11" fill="var(--mascot-ink)" />
          <path d={`M${i ? 127 : 67} 94v4`} stroke="white" strokeWidth="2" />
          <path d={d} fill={`url(#${id}-scan)`} />
        </g>
      </g>)}
      <path d={pose === 'guard' ? 'm46 81 42 13m23 0 43-13' : pose === 'confused' ? 'm48 81 37-2m28 10 41-12' : 'm46 82 41 10m25 0 42-12'} stroke="var(--mascot-edge)" strokeWidth="2.5" />
      <path d="m96 115 7 2-4 4z" fill="currentColor" />
      <path d={pose === 'confused' ? 'M96 130q6-4 11 0' : tired ? 'M94 129h13' : 'M94 128q9 5 17-4l-2 8'} fill="none" stroke="var(--mascot-edge)" strokeWidth="1.8" />
      {!tired && pose !== 'confused' && <path d="m105 128 5-2-2 6z" fill="var(--mascot-eye-white)" />}
      <path d="M48 112 16 106m30 11-33 6m143-10 31-8m-30 13 30 9" fill="none" stroke="var(--mascot-edge)" strokeWidth="1.3" />
      <path d="M43 71q-9 2-8 8m1-3q-8 4-4 10" fill="none" stroke="var(--mascot-glitch)" strokeWidth="2" />
      {pose === 'cool' && <g>
        <path d="m42 84 49 8-4 23-35-8zm66 8 50-10-9 26-35 7z" fill="var(--mascot-ink)" stroke="currentColor" strokeWidth="2" />
        <path d="m89 95 20-1m-65-8-8-2m121 0 9-4" stroke="currentColor" strokeWidth="3" />
        <path d="m54 92 15 3m-11 1 16 3m48-4 15-3m-11 7 15-3" stroke="var(--mascot-eye-white)" strokeWidth="3" />
      </g>}
      <path d="m57 131 88-3-7 12-74 6z" fill="var(--mascot-visor)" stroke="var(--mascot-edge)" strokeWidth="1.5" />
      <path d="m68 132 9-1 1 11-9 1zm61-3 8-1-1 11-9 1z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" />
      <path d="m80 140 44-2 2 15-45 2z" fill="var(--mascot-tag)" stroke="currentColor" strokeWidth="1.3" />
      <text x="103" y="150" transform="rotate(-3 103 150)" textAnchor="middle" fontSize="8" fontWeight="700" fontFamily="sans-serif" fill="currentColor">{t('tourMascotName')}</text>
    </g>
    {pose === 'navigate' && <g>
      <path d="m49 171 104-2 7 7-2 32-111 2-5-7 1-26z" fill="var(--mascot-tag)" stroke="currentColor" strokeWidth="1.8" />
      <path d="m49 178 103-2m-98 27 96-2" stroke="var(--mascot-edge)" strokeWidth="1" opacity=".55" />
      <path d="M61 166Q55 156 65 155Q77 153 83 164L85 175Q72 183 58 176Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
      <path d="M123 164Q128 153 140 154Q151 155 145 167L148 175Q134 183 120 175Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
      <path d="m66 169-1 7m9-8v8m56-7v7m9-7 1 6" fill="none" stroke="var(--mascot-edge)" strokeWidth="1.2" />
      <path d="M84 192h31m-11-9 11 9-11 10" fill="none" stroke="currentColor" strokeWidth="2.7" strokeLinejoin="miter" />
      <path d="M48 188h6m93 11h10" stroke="var(--mascot-glitch)" strokeWidth="2" />
    </g>}
    {pose === 'file' && <g transform="rotate(-9 105 179)">
      <path d="M76 155h44l13 14v34H76Z" fill="var(--mascot-tag)" stroke="currentColor" strokeWidth="1.8" />
      <path d="M119 156v14h13m-46 9 6 4-6 4m14 0h13m-27 8h29" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M70 174q-9-4-12 5t12 12l11-4-1-11zm67-1q11-1 12 8t-17 10l-8-4 2-11z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
    </g>}
    {pose === 'guard' && <g>
      <path d="m87 158 26-7 26 7-3 24q-7 14-23 22-20-9-26-22z" fill="var(--mascot-tag)" stroke="currentColor" strokeWidth="2" />
      <path d="m94 164 19-5 18 5-2 16q-4 10-16 16-13-7-17-16z" fill="currentColor" opacity=".15" />
      <path d="m102 175 8 8 15-16" stroke="currentColor" strokeWidth="3" fill="none" />
      <path d="M82 175q-15-6-17 6t23 11m52-17q13-6 15 6t-20 11" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.6" />
    </g>}
    {pose === 'power' && <g>
      <circle cx="112" cy="178" r="23" fill="var(--mascot-tag)" stroke="currentColor" strokeWidth="1.8" />
      <path d="M103 167a14 14 0 1 0 18 0m-9-9v18" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M64 179q4-12 20-6l18 10-4 10-22-1Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.7" />
      <path d="m148 152 8-9-1 11 8-2-10 13 1-12z" fill="var(--mascot-glitch)" />
    </g>}
    {pose === 'confused' && <g>
      <path d="M64 172q-13-10-22-7l-8 6 7 8 21 4m77-11q13-10 22-7l8 6-7 8-21 4" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.7" />
      <path d="M167 39q-2-12 8-12 10 0 8 8-1 5-8 7v6m0 7v3" fill="none" stroke="currentColor" strokeWidth="2.7" />
    </g>}
    {pose === 'peace' && <g>
      <path d="M137 182q10-5 12-22l-3-16q1-6 5-2l7 13 6-21q3-6 6-1l-1 23 8-5 6 6-8 13-8 4q-3 17-20 21Z" fill="var(--mascot-paws)" stroke="var(--mascot-edge)" strokeWidth="1.7" />
      <path d="m157 163 14 6m-8-21 5 1" stroke="currentColor" strokeWidth="1.5" />
    </g>}
    {(pose === 'smirk' || pose === 'cool' || tired) && <path d="m79 25-2-17 12 10 9-16 8 15 15-9-6 18-20 3z" fill="none" stroke="currentColor" strokeWidth="1.8" transform="rotate(-9 99 16)" />}
    <g fill="currentColor"><path d="M15 69h13v3H15m-7 24h16v2H8m161-40h18v3h-18m-11 62h24v2h-24M23 193h19v2H23m124 11h26v2h-26" /><path d="M20 74h4v4h-4m159 20h5v5h-5M31 182h5v5h-5" opacity=".7" /></g>
    <path d="M12 71h10m153-11h17m-15 68h12M22 198h16m104 14h27" stroke="var(--mascot-glitch)" strokeWidth="2" opacity=".8" />
  </svg>
}
