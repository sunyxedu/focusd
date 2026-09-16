import React from 'react';

type P = React.SVGProps<SVGSVGElement>;
const base = (extra: P): P => ({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', ...extra });

// ---- Perspective icons (colored, filled) ----
export const InboxIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v6h3.5a3.5 3.5 0 0 0 7 0H19V6H5z" />
  </svg>
);
export const ProjectsIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="6.5" cy="6.5" r="3.2" />
    <circle cx="17.5" cy="6.5" r="3.2" />
    <circle cx="6.5" cy="17.5" r="3.2" />
    <circle cx="17.5" cy="17.5" r="3.2" />
  </svg>
);
export const TagIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 12.6V4a1 1 0 0 1 1-1h8.6a1 1 0 0 1 .7.3l8.4 8.4a1 1 0 0 1 0 1.4l-8.6 8.6a1 1 0 0 1-1.4 0L3.3 13.3a1 1 0 0 1-.3-.7zM7.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
  </svg>
);
export const TagOutlineIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <path d="M3.5 12.4V4.5a1 1 0 0 1 1-1h7.9a1 1 0 0 1 .7.3l7.7 7.7a1 1 0 0 1 0 1.4l-7.9 7.9a1 1 0 0 1-1.4 0L3.8 13.1a1 1 0 0 1-.3-.7z" />
    <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
export const ForecastIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm1 5v11h14V8H5z" />
    <rect x="7" y="10" width="3" height="3" rx="0.5" fill="#fff" />
    <rect x="10.5" y="10" width="3" height="3" rx="0.5" fill="#fff" />
    <rect x="14" y="10" width="3" height="3" rx="0.5" fill="#fff" />
    <rect x="7" y="14" width="3" height="3" rx="0.5" fill="#fff" />
    <rect x="10.5" y="14" width="3" height="3" rx="0.5" fill="#fff" />
  </svg>
);
export const FlagIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M5 3a1 1 0 0 1 1 1v.3C7.4 3.6 9 3 10.8 3c1.9 0 3 .6 4 1.2.9.5 1.7 1 3.2 1 .8 0 1.4-.1 2-.3v9.7c-.7.3-1.4.4-2.2.4-1.6 0-2.5-.5-3.4-1s-1.9-1-3.6-1c-1.6 0-3 .5-4.8 1.6V21a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1z" />
  </svg>
);
export const FlagOutlineIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <path d="M5.5 21V4" />
    <path d="M5.5 5c1.8-1.2 3.5-1.6 5.3-1.6 3.2 0 4 2.2 7.2 2.2.7 0 1.3-.1 2-.3v8.6c-.7.2-1.3.3-2 .3-3.2 0-4-2.2-7.2-2.2-1.8 0-3.5.4-5.3 1.6" />
  </svg>
);
export const NearbyIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2a7 7 0 0 1 7 7c0 4.7-5.2 10.6-6.5 12a.7.7 0 0 1-1 0C10.2 19.6 5 13.7 5 9a7 7 0 0 1 7-7zm0 4.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z" />
  </svg>
);
export const ReviewIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 4h18a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 7h16v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7zm5 2v2.5a3 3 0 0 0 6 0V13h-2v2.5a1 1 0 0 1-2 0V13H9z" />
  </svg>
);

// ---- Toolbar / generic icons ----
export const SidebarIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2.5" />
    <path d="M9 5v14" />
    <path d="M5.5 8.5h1.5M5.5 11h1.5M5.5 13.5h1.5" strokeWidth="1.4" />
  </svg>
);
export const ChevronLeft = (p: P) => (
  <svg {...base({ strokeWidth: 2.2 })} {...p}>
    <path d="M14.5 5.5 8 12l6.5 6.5" />
  </svg>
);
export const ChevronRight = (p: P) => (
  <svg {...base({ strokeWidth: 2.2 })} {...p}>
    <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
  </svg>
);
export const ChevronDown = (p: P) => (
  <svg {...base({ strokeWidth: 2.2 })} {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);
export const ChevronUp = (p: P) => (
  <svg {...base({ strokeWidth: 2.2 })} {...p}>
    <path d="m6 14.5 6-6 6 6" />
  </svg>
);
export const EyeIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2 })} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const InboxPlusIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <path d="M3.5 13.5v4a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4" />
    <path d="M3.5 13.5h4.5a4 4 0 0 0 8 0h4.5" />
    <path d="M12 4v6M9 7h6" strokeWidth="1.8" />
  </svg>
);
export const FocusIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <path d="M4 9V6a2 2 0 0 1 2-2h3M15 4h3a2 2 0 0 1 2 2v3M20 15v3a2 2 0 0 1-2 2h-3M9 20H6a2 2 0 0 1-2-2v-3" />
    <circle cx="12" cy="12" r="2.5" strokeWidth="1.5" />
  </svg>
);
export const InfoIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 8v.2" strokeWidth="2.2" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2 })} {...p}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="m15.5 15.5 4.5 4.5" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base({ strokeWidth: 3 })} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const MinusIcon = (p: P) => (
  <svg {...base({ strokeWidth: 3 })} {...p}>
    <path d="M6 12h12" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base({ strokeWidth: 2.2 })} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const NoteIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zm3 5v1.8h10V8H7zm0 3.6v1.8h10v-1.8H7zm0 3.6V17h6v-1.8H7z" />
  </svg>
);
export const NoteOutlineIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="2" />
    <path d="M8 9h8M8 12.5h8M8 16h5" />
  </svg>
);
export const CalendarIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
  </svg>
);
export const CalendarDueIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    <path d="M7 13h3v3H7z" fill="currentColor" stroke="none" />
  </svg>
);
export const RepeatIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.8 })} {...p}>
    <path d="M17 2.5 20.5 6 17 9.5" />
    <path d="M4 11V9a3 3 0 0 1 3-3h13" />
    <path d="m7 21.5-3.5-3.5L7 14.5" />
    <path d="M20 13v2a3 3 0 0 1-3 3H4" />
  </svg>
);
export const ClockIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.8 })} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);
export const GearIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.7 })} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </svg>
);
export const FolderIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h5l2 2h8A1.5 1.5 0 0 1 21 7.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-13z" />
  </svg>
);
export const PlayIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zm-2 5.8v7.4l6-3.7-6-3.7z" />
  </svg>
);
export const PauseIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19zM9 8v8h2V8H9zm4 0v8h2V8h-2z" />
  </svg>
);
export const CheckCircleIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.8 })} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12.5 2.8 2.8L16.5 9.5" />
  </svg>
);
export const MinusCircleIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.8 })} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </svg>
);
export const ParallelIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="8" cy="8" r="2.6" />
    <circle cx="16" cy="8" r="2.6" />
    <circle cx="8" cy="16" r="2.6" />
    <circle cx="16" cy="16" r="2.6" />
  </svg>
);
export const SequentialIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="6" cy="6" r="2.4" />
    <circle cx="12" cy="12" r="2.4" />
    <circle cx="18" cy="18" r="2.4" />
    <path d="M7.5 7.5 10.3 10.3M13.7 13.7l2.8 2.8" stroke="currentColor" strokeWidth="1.6" />
  </svg>
);
export const SingleActionsIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="12" cy="6" r="2.4" />
    <circle cx="6" cy="14" r="2.4" />
    <circle cx="18" cy="14" r="2.4" />
    <circle cx="12" cy="19" r="2.2" />
  </svg>
);
export const ProjectSmallIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <circle cx="7" cy="7" r="3" />
    <circle cx="17" cy="7" r="3" />
    <circle cx="7" cy="17" r="3" />
    <circle cx="17" cy="17" r="3" />
  </svg>
);
export const DisclosureIcon = (p: P) => (
  <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
    <path d="M8 4.5 17 12l-9 7.5z" />
  </svg>
);
export const TodayIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <path d="M12 3v3M4.5 7.5 6.6 9.6M19.5 7.5l-2.1 2.1M3 15h18" />
    <path d="M6.5 15a5.5 5.5 0 0 1 11 0" />
    <path d="M4 19h16" />
  </svg>
);
export const ClearIcon = (p: P) => (
  <svg {...base({ strokeWidth: 1.6 })} {...p}>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m9 9 6 6M15 9l-6 6" />
  </svg>
);
export const UndoIcon = (p: P) => (
  <svg {...base({})} {...p}>
    <path d="M9 14 4 9l5-5" />
    <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
  </svg>
);

/** Big empty-state artwork, drawn like Focusd's grey glyphs */
export const EmptyInboxArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M30 40h140a14 14 0 0 1 14 14v100a14 14 0 0 1-14 14H30a14 14 0 0 1-14-14V54a14 14 0 0 1 14-14zm2 18v56h34a34 34 0 0 0 68 0h34V58H32z" opacity="0.6" />
  </svg>
);
export const EmptyForecastArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M30 30h140a14 14 0 0 1 14 14v112a14 14 0 0 1-14 14H30a14 14 0 0 1-14-14V44a14 14 0 0 1 14-14zm2 20v98h136V50H32z" opacity="0.6" />
    <rect x="50" y="72" width="26" height="22" rx="5" opacity="0.6" />
    <rect x="87" y="72" width="26" height="22" rx="5" opacity="0.6" />
    <rect x="124" y="72" width="26" height="22" rx="5" opacity="0.6" />
    <rect x="50" y="106" width="26" height="22" rx="5" opacity="0.6" />
    <rect x="87" y="106" width="26" height="22" rx="5" opacity="0.6" />
  </svg>
);
export const EmptyFlagArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M44 20a7 7 0 0 1 7 7v3c14-8 27-13 42-13 17 0 27 6 36 11 8 5 15 9 28 9 7 0 13-1 18-3v84c-6 3-13 4-20 4-14 0-22-4-30-9-8-4-17-9-32-9-14 0-27 5-42 14v53a7 7 0 1 1-14 0V27a7 7 0 0 1 7-7z" opacity="0.6" />
  </svg>
);
export const EmptyProjectsArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <circle cx="60" cy="60" r="30" opacity="0.6" />
    <circle cx="140" cy="60" r="30" opacity="0.6" />
    <circle cx="60" cy="140" r="30" opacity="0.6" />
    <circle cx="140" cy="140" r="30" opacity="0.6" />
  </svg>
);
export const EmptyTagsArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M24 106V34a10 10 0 0 1 10-10h72a10 10 0 0 1 7 3l70 70a10 10 0 0 1 0 14l-72 72a10 10 0 0 1-14 0L27 113a10 10 0 0 1-3-7zm38-30a12 12 0 1 0 0-24 12 12 0 0 0 0 24z" opacity="0.6" />
  </svg>
);
export const EmptyReviewArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M24 30h152a8 8 0 0 1 8 8v26a8 8 0 0 1-8 8H24a8 8 0 0 1-8-8V38a8 8 0 0 1 8-8zm8 52h136v66a18 18 0 0 1-18 18H50a18 18 0 0 1-18-18V82zm40 18v22a28 28 0 0 0 56 0v-22h-18v22a10 10 0 0 1-20 0v-22H72z" opacity="0.6" />
  </svg>
);
export const EmptyNearbyArt = (p: P) => (
  <svg viewBox="0 0 200 200" fill="currentColor" {...p}>
    <path d="M100 16a60 60 0 0 1 60 60c0 40-45 90-56 102a6 6 0 0 1-8 0C85 166 40 116 40 76a60 60 0 0 1 60-60zm0 38a22 22 0 1 0 0 44 22 22 0 0 0 0-44z" opacity="0.6" />
  </svg>
);
