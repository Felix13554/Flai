import React from 'react';
import { Link } from 'react-router-dom';
import EditableContent from '../components/EditableContent';

const NotFoundPage: React.FC = () => {
  return (
    <div className="min-h-screen pt-24 pb-16 bg-neutral-900 not-found-page">

      {/* Animated background particles */}
      <div className="not-found-particles" aria-hidden="true">
        {[...Array(12)].map((_, i) => (
          <span key={i} className={`not-found-particle not-found-particle--${i + 1}`} />
        ))}
      </div>

      <div className="container max-w-2xl mx-auto text-center">

        {/* OOPS! stamp above the card */}
        <div className="not-found-oops" aria-hidden="true">
          {'OOPS!!!'.split('').map((char, i) => (
            <span key={i} style={{ animationDelay: `${i * 0.08}s` }}>{char}</span>
          ))}
        </div>

        <div className="bg-neutral-800 rounded-xl shadow-md p-8 border border-neutral-700 not-found-card">

          {/* ── Illustration ── */}
          <div className="not-found-illustration" aria-hidden="true">

            {/* Ghost 404 numbers sitting behind the robot */}
            <div className="not-found-ghost-nums">
              <span>4</span><span>0</span><span>4</span>
            </div>

            {/* ── Improved Robot SVG ── */}
            <svg
              className="not-found-robot"
              viewBox="0 0 180 240"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* ── Antenna ── */}
              <line x1="90" y1="6" x2="90" y2="32" stroke="#0F52BA" strokeWidth="3" strokeLinecap="round"/>
              {/* Antenna ball with glow ring */}
              <circle cx="90" cy="5" r="7" fill="#0F52BA" opacity="0.2" className="nf-antenna-ring"/>
              <circle cx="90" cy="5" r="4.5" fill="#64A0FF" className="nf-antenna"/>

              {/* ── Head ── */}
              <rect x="45" y="32" width="90" height="58" rx="14" fill="#0F52BA"/>
              {/* Head highlight */}
              <rect x="52" y="38" width="76" height="20" rx="8" fill="#64A0FF" opacity="0.18"/>

              {/* ── Ear speakers ── */}
              <rect x="31" y="46" width="14" height="26" rx="6" fill="#0A3A82"/>
              <circle cx="38" cy="59" r="6" fill="#0F52BA"/>
              <circle cx="38" cy="59" r="3" fill="#64A0FF" opacity="0.6"/>

              <rect x="135" y="46" width="14" height="26" rx="6" fill="#0A3A82"/>
              <circle cx="142" cy="59" r="6" fill="#0F52BA"/>
              <circle cx="142" cy="59" r="3" fill="#64A0FF" opacity="0.6"/>

              {/* ── Left eye — X (crashed/error) ── */}
              <circle cx="68" cy="58" r="12" fill="#0A3A82"/>
              <line x1="61" y1="51" x2="75" y2="65" stroke="#FF6B35" strokeWidth="3.5" strokeLinecap="round"/>
              <line x1="75" y1="51" x2="61" y2="65" stroke="#FF6B35" strokeWidth="3.5" strokeLinecap="round"/>

              {/* ── Right eye — glowing lens ── */}
              <circle cx="112" cy="58" r="12" fill="#0A3A82"/>
              <circle cx="112" cy="58" r="7.5" fill="#64A0FF" opacity="0.9"/>
              <circle cx="112" cy="58" r="4" fill="white"/>
              <circle cx="114" cy="56" r="1.5" fill="#0F52BA"/>
              {/* Lens flare */}
              <circle cx="108" cy="54" r="1.5" fill="white" opacity="0.7"/>

              {/* ── Mouth / status bar ── */}
              <rect x="68" y="76" width="44" height="8" rx="4" fill="#0A3A82"/>
              {/* Blinking segment */}
              <rect x="70" y="78" width="10" height="4" rx="2" fill="#FF6B35" className="nf-blink"/>
              <rect x="83" y="78" width="10" height="4" rx="2" fill="#64A0FF" opacity="0.4"/>
              <rect x="96" y="78" width="10" height="4" rx="2" fill="#64A0FF" opacity="0.2"/>

              {/* ── Neck ── */}
              <rect x="80" y="90" width="20" height="12" rx="4" fill="#0A3A82"/>
              {/* Neck screw detail */}
              <circle cx="85" cy="96" r="2" fill="#64A0FF" opacity="0.4"/>
              <circle cx="95" cy="96" r="2" fill="#64A0FF" opacity="0.4"/>

              {/* ── Body ── */}
              <rect x="35" y="102" width="110" height="72" rx="16" fill="#0F52BA"/>
              {/* Body highlight */}
              <rect x="42" y="108" width="96" height="18" rx="8" fill="#64A0FF" opacity="0.12"/>

              {/* ── Chest screen ── */}
              <rect x="50" y="114" width="80" height="50" rx="10" fill="#0A3A82"/>
              <rect x="52" y="116" width="76" height="46" rx="9" fill="#060F1E"/>

              {/* Screen scanlines */}
              {[120,125,130,135,140,145,150,155].map((y, i) => (
                <line key={i} x1="54" y1={y} x2="126" y2={y} stroke="#64A0FF" strokeWidth="0.4" opacity="0.15"/>
              ))}

              {/* ── Spinning gear on screen ── */}
              <g className="nf-gear" style={{ transformOrigin: '90px 139px' }}>
                {/* Outer ring */}
                <circle cx="90" cy="139" r="14" fill="none" stroke="#0F52BA" strokeWidth="3"/>
                {/* Gear teeth */}
                {[0,30,60,90,120,150,180,210,240,270,300,330].map((a, i) => (
                  <rect key={i} x="88.5" y="122" width="3" height="6" rx="1.5" fill="#0F52BA"
                    style={{ transformOrigin: '90px 139px', transform: `rotate(${a}deg)` }}/>
                ))}
                {/* Inner hub */}
                <circle cx="90" cy="139" r="7" fill="#0F52BA"/>
                <circle cx="90" cy="139" r="3.5" fill="#64A0FF"/>
                <circle cx="91.5" cy="137.5" r="1" fill="white" opacity="0.6"/>
              </g>

              {/* Warning triangle */}
              <g transform="translate(108, 126)">
                <polygon points="9,2 17,16 1,16" fill="#FF6B35" opacity="0.9"/>
                <line x1="9" y1="7" x2="9" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
                <circle cx="9" cy="14.5" r="1" fill="white"/>
              </g>

              {/* ── Left arm + wrench ── */}
              <rect x="12" y="108" width="23" height="14" rx="7" fill="#0A3A82"/>
              {/* Wrench */}
              <g transform="translate(0,2) rotate(-30, 18, 130)">
                {/* Wrench handle */}
                <rect x="14" y="118" width="9" height="26" rx="4" fill="#64A0FF"/>
                {/* Wrench head open-end */}
                <circle cx="18.5" cy="118" r="9" fill="none" stroke="#64A0FF" strokeWidth="4"/>
                <rect x="14" y="112" width="9" height="9" rx="1" fill="#0A3A82"/>
                {/* Center hole */}
                <circle cx="18.5" cy="118" r="3.5" fill="#0A3A82"/>
              </g>

              {/* ── Right arm — waving ── */}
              <rect x="145" y="108" width="23" height="14" rx="7" fill="#0A3A82" className="nf-wave" style={{ transformOrigin: '145px 115px' }}/>
              {/* Hand */}
              <circle cx="171" cy="115" r="7" fill="#0F52BA" className="nf-wave" style={{ transformOrigin: '145px 115px' }}/>

              {/* ── Sparks top-right ── */}
              <g className="nf-spark">
                <line x1="163" y1="96" x2="171" y2="88" stroke="#FF6B35" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="167" y1="100" x2="176" y2="100" stroke="#FF6B35" strokeWidth="2.2" strokeLinecap="round"/>
                <line x1="163" y1="105" x2="171" y2="113" stroke="#FF6B35" strokeWidth="2.2" strokeLinecap="round"/>
                <circle cx="171" cy="88" r="2" fill="#FBBF24"/>
                <circle cx="176" cy="100" r="2" fill="#FBBF24"/>
              </g>

              {/* ── Hips ── */}
              <rect x="58" y="171" width="64" height="16" rx="8" fill="#0A3A82"/>

              {/* ── Left leg ── */}
              <rect x="55" y="185" width="28" height="38" rx="10" fill="#0A3A82"/>
              {/* Left foot */}
              <rect x="50" y="217" width="36" height="14" rx="7" fill="#0F52BA"/>
              <rect x="52" y="219" width="32" height="10" rx="5" fill="#0A3A82" opacity="0.5"/>

              {/* ── Right leg (slightly kicked out) ── */}
              <g style={{ transform: 'rotate(12deg)', transformOrigin: '112px 185px' }}>
                <rect x="97" y="185" width="28" height="32" rx="10" fill="#0A3A82"/>
                <rect x="94" y="211" width="36" height="14" rx="7" fill="#0F52BA"/>
                <rect x="96" y="213" width="32" height="10" rx="5" fill="#0A3A82" opacity="0.5"/>
              </g>

              {/* ── Ground shadow ellipse ── */}
              <ellipse cx="90" cy="236" rx="62" ry="7" fill="#0F52BA" opacity="0.18"/>

              {/* ── Scattered bolts on ground ── */}
              <g opacity="0.6">
                <circle cx="36" cy="228" r="3.5" fill="#64A0FF"/>
                <circle cx="38" cy="229" r="1.5" fill="#0A3A82"/>
              </g>
              <g opacity="0.45">
                <circle cx="140" cy="232" r="3" fill="#64A0FF"/>
                <circle cx="140" cy="232" r="1.2" fill="#0A3A82"/>
              </g>
              <g opacity="0.5" transform="rotate(25, 50, 234)">
                <rect x="46" y="230" width="7" height="7" rx="1.5" fill="#0F52BA"/>
                <line x1="48" y1="232" x2="52" y2="232" stroke="#64A0FF" strokeWidth="1.5"/>
                <line x1="50" y1="230" x2="50" y2="234" stroke="#64A0FF" strokeWidth="1.5"/>
              </g>
            </svg>

            {/* ── Disconnected plug wires ── */}
            <svg className="not-found-plugs" viewBox="0 0 340 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Left cable */}
              <path d="M10 44 C40 44 55 20 100 28 C130 34 150 38 165 36"
                stroke="#0F52BA" strokeWidth="3" strokeLinecap="round" fill="none"/>
              {/* Left plug body */}
              <rect x="0" y="34" width="18" height="22" rx="4" fill="#0F52BA"/>
              <rect x="2" y="36" width="14" height="18" rx="3" fill="#0A3A82"/>
              {/* Left plug pins */}
              <rect x="5" y="29" width="3.5" height="9" rx="1.5" fill="#64A0FF"/>
              <rect x="11.5" y="29" width="3.5" height="9" rx="1.5" fill="#64A0FF"/>
              {/* Left spark cluster */}
              <g className="nf-plug-spark">
                <line x1="22" y1="30" x2="29" y2="23" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <line x1="26" y1="33" x2="34" y2="33" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <line x1="22" y1="37" x2="29" y2="44" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="30" cy="23" r="2.5" fill="#FBBF24"/>
                <circle cx="35" cy="33" r="2.5" fill="#FBBF24"/>
              </g>

              {/* Right cable */}
              <path d="M330 44 C300 44 285 20 240 28 C210 34 190 38 175 36"
                stroke="#0F52BA" strokeWidth="3" strokeLinecap="round" fill="none"/>
              {/* Right plug body */}
              <rect x="322" y="34" width="18" height="22" rx="4" fill="#0F52BA"/>
              <rect x="324" y="36" width="14" height="18" rx="3" fill="#0A3A82"/>
              {/* Right plug pins */}
              <rect x="325" y="29" width="3.5" height="9" rx="1.5" fill="#64A0FF"/>
              <rect x="331.5" y="29" width="3.5" height="9" rx="1.5" fill="#64A0FF"/>
              {/* Right spark cluster */}
              <g className="nf-plug-spark">
                <line x1="318" y1="30" x2="311" y2="23" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <line x1="314" y1="33" x2="306" y2="33" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <line x1="318" y1="37" x2="311" y2="44" stroke="#FF6B35" strokeWidth="2" strokeLinecap="round"/>
                <circle cx="310" cy="23" r="2.5" fill="#FBBF24"/>
                <circle cx="305" cy="33" r="2.5" fill="#FBBF24"/>
              </g>

              {/* Middle gap label */}
              <text x="170" y="20" textAnchor="middle" fontSize="9" fill="#64A0FF" opacity="0.7"
                fontFamily="monospace" letterSpacing="2"><EditableContent contentKey="not-found-page-disconnected" fallback="DISCONNECTED" /></text>
              <line x1="140" y1="24" x2="158" y2="24" stroke="#64A0FF" strokeWidth="0.8" opacity="0.5"/>
              <line x1="182" y1="24" x2="200" y2="24" stroke="#64A0FF" strokeWidth="0.8" opacity="0.5"/>
            </svg>
          </div>

          {/* ── Text content ── */}
          <EditableContent
            contentKey="404-error-code"
            as="h1"
            className="text-6xl font-bold text-primary mb-4 not-found-code"
            fallback="404"
          />

          <EditableContent
            contentKey="404-page-title"
            as="h2"
            className="text-2xl font-semibold mb-6"
            fallback="Siden blev ikke fundet"
          />

          <EditableContent
            contentKey="404-page-message"
            as="p"
            className="text-neutral-300 mb-8"
            fallback="Beklager, men siden du leder efter findes ikke eller er blevet flyttet."
          />

          <Link to="/" className="btn-primary inline-block not-found-btn">
            <EditableContent
              contentKey="404-home-button"
              fallback="Gå til forsiden"
            />
          </Link>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;