"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";

type GameMode =
  | "Eurovisión"
  | "OT"
  | "Todo"
  | "Globales"
  | "Pop"
  | "2000s"
  | "Anime";
type TrackMode = Exclude<GameMode, "Todo">;
type Structure = "individual" | "teams";
type Theme = "dark" | "light";
type CatalogSortOption =
  | "year-desc"
  | "year-asc"
  | "title-asc"
  | "title-desc"
  | "artist-asc"
  | "artist-desc";

type GuessFieldId =
  | "song"
  | "year"
  | "range"
  | "title"
  | "author"
  | "country"
  | "euroPosition"
  | "language"
  | "otPerformers"
  | "otEdition"
  | "otGala"
  | "otNominations"
  | "anime"
  | "animeSlot"
  | "animeSeason";

type Track = {
  id: string;
  title: string;
  artist: string;
  year: number;
  mode: TrackMode;
  modes?: TrackMode[];
  audioSrc: string;
  extra: Partial<Record<GuessFieldId, string>>;
};

type Card = {
  id: string;
  trackId: string;
  title: string;
  artist: string;
  year: number;
  mode: TrackMode;
  modes?: TrackMode[];
  points: number;
  round: number;
  kind?: "won" | "timeline-year";
};

type Player = {
  id: string;
  name: string;
  teamId: string | null;
  score: number;
  cards: Card[];
};

type Team = {
  id: string;
  name: string;
  score: number;
  cards: Card[];
};

type GameState = {
  mode: GameMode;
  structure: Structure;
  selectedFields: GuessFieldId[];
  players: Player[];
  teams: Team[];
  catalog: Track[];
  importedPacks: string[];
  currentTrackId: string | null;
  timelineYear: number | null;
  usedTrackIds: string[];
  revealed: boolean;
  scoreFields: GuessFieldId[];
  turnIndex: number;
  round: number;
  handView: string | null;
  followTurnHand: boolean;
  avoidRepeats: boolean;
  includeOtGalaInGlobales: boolean;
};

type DraftTrack = {
  title: string;
  artist: string;
  year: string;
  mode: TrackMode;
  modes: TrackMode[];
  audioSrc: string;
  extra: Partial<Record<GuessFieldId, string>>;
};

type Participant = {
  key: string;
  kind: Structure;
  id: string;
  name: string;
  score: number;
  cards: Card[];
  members?: string;
};

type ScoreAnimation = {
  id: string;
  activeKey: string;
  trackId: string;
  participantName: string;
  nextName: string;
  points: number;
};

type TrackMatchOptions = {
  includeOtGalaInGlobales?: boolean;
};

const STORAGE_KEY = "twinkster-local-discord-v1";
const THEME_KEY = "twinkster-theme-v1";
const SCORE_ANIMATION_MS = 900;

const MODES: GameMode[] = [
  "Eurovisión",
  "OT",
  "Todo",
  "Globales",
  "Pop",
  "2000s",
  "Anime",
];
const TRACK_MODES: TrackMode[] = [
  "Eurovisión",
  "OT",
  "Globales",
  "Pop",
  "2000s",
  "Anime",
];

const CATALOG_FILTER_MODES: GameMode[] = ["Todo", ...TRACK_MODES];
const CATALOG_SORT_OPTIONS: Array<{
  id: CatalogSortOption;
  label: string;
}> = [
  { id: "year-desc", label: "Fecha: recientes primero" },
  { id: "year-asc", label: "Fecha: antiguas primero" },
  { id: "title-asc", label: "Titulo A-Z" },
  { id: "title-desc", label: "Titulo Z-A" },
  { id: "artist-asc", label: "Artista A-Z" },
  { id: "artist-desc", label: "Artista Z-A" },
];
const CATALOG_COLLATOR = new Intl.Collator("es", {
  numeric: true,
  sensitivity: "base",
});

const FIELD_DEFS: Array<{
  id: GuessFieldId;
  label: string;
  group: "Base" | "Eurovisión" | "OT" | "Anime";
}> = [
  { id: "song", label: "Canción reconocida", group: "Base" },
  { id: "year", label: "Año exacto", group: "Base" },
  { id: "range", label: "Rango / timeline", group: "Base" },
  { id: "title", label: "Título", group: "Base" },
  { id: "author", label: "Autor / intérprete", group: "Base" },
  { id: "country", label: "País", group: "Eurovisión" },
  { id: "euroPosition", label: "Puesto / resultado", group: "Eurovisión" },
  { id: "language", label: "Idioma", group: "Eurovisión" },
  { id: "otPerformers", label: "Quién la canta en OT", group: "OT" },
  { id: "otEdition", label: "Edición / año OT", group: "OT" },
  { id: "otGala", label: "Gala o Post OT", group: "OT" },
  { id: "otNominations", label: "Nominaciones", group: "OT" },
  { id: "anime", label: "Anime", group: "Anime" },
  { id: "animeSlot", label: "Opening / ending", group: "Anime" },
  { id: "animeSeason", label: "Temporada / arco", group: "Anime" },
];

const BASE_FIELD_IDS: GuessFieldId[] = [
  "song",
  "year",
  "range",
  "title",
  "author",
];

const EXTRA_FIELDS_BY_MODE: Record<TrackMode, GuessFieldId[]> = {
  Eurovisión: ["country", "euroPosition", "language"],
  OT: ["otPerformers", "otEdition", "otGala", "otNominations"],
  Globales: [],
  Pop: [],
  "2000s": [],
  Anime: ["anime", "animeSlot", "animeSeason"],
};

function isTrackMode(value: unknown): value is TrackMode {
  return typeof value === "string" && TRACK_MODES.includes(value as TrackMode);
}

function normalizeModeLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isOtPostExtra(extra: Partial<Record<GuessFieldId, string>>) {
  const text = normalizeModeLabel(
    `${extra.otGala ?? ""} ${extra.otNominations ?? ""}`,
  );

  return text.includes("post");
}

function isOtGalaTrack(track: Pick<Track, "mode" | "extra">) {
  return track.mode === "OT" && !isOtPostExtra(track.extra);
}

function modeFromText(value: string | undefined) {
  const normalized = normalizeModeLabel(value ?? "");
  return (
    TRACK_MODES.find((mode) => normalizeModeLabel(mode) === normalized) ?? null
  );
}

function defaultModesForTrack(mode: TrackMode): TrackMode[] {
  if (mode === "Anime") {
    return ["Anime"];
  }

  if (mode === "Eurovisión") {
    return [mode, "Globales"];
  }

  if (mode === "OT") {
    return ["OT"];
  }

  if (mode === "2000s" || mode === "Globales" || mode === "Pop") {
    return Array.from(new Set([mode, "Globales", "Pop"]));
  }

  return [mode];
}

function uniqueTrackModes(
  modes: Array<TrackMode | string | null | undefined>,
  fallback: TrackMode,
) {
  const validModes: TrackMode[] = [];

  modes.forEach((mode) => {
    const resolvedMode = isTrackMode(mode) ? mode : modeFromText(mode ?? "");
    if (resolvedMode && !validModes.includes(resolvedMode)) {
      validModes.push(resolvedMode);
    }
  });

  return validModes.length ? validModes : [fallback];
}

function modesForTrack(mode: TrackMode, modes?: Array<TrackMode | string>) {
  const providedModes = modes?.length ? modes : defaultModesForTrack(mode);
  return uniqueTrackModes([mode, ...providedModes], mode);
}

function normalizedTrackModes(
  mode: TrackMode,
  modes: Array<TrackMode | string> | undefined,
  extra: Partial<Record<GuessFieldId, string>>,
) {
  const normalizedModes = modesForTrack(mode, modes);

  if (mode !== "OT") {
    return normalizedModes;
  }

  if (isOtPostExtra(extra)) {
    return uniqueTrackModes([...normalizedModes, "Globales", "Pop"], "OT");
  }

  return uniqueTrackModes(
    normalizedModes.filter((trackMode) => trackMode !== "Globales" && trackMode !== "Pop"),
    "OT",
  );
}

function trackMatchesMode(
  track: Track,
  mode: GameMode,
  options: TrackMatchOptions = {},
) {
  if (mode === "Todo") {
    return true;
  }

  if (mode === "Globales" && isOtGalaTrack(track)) {
    return Boolean(options.includeOtGalaInGlobales);
  }

  return modesForTrack(track.mode, track.modes).includes(mode as TrackMode);
}

function displayTrackModes(track: Track) {
  return modesForTrack(track.mode, track.modes).join(", ");
}

function catalogSearchText(track: Track) {
  const searchableParts = [
    track.title,
    track.artist,
    String(track.year),
    displayTrackModes(track),
    ...Object.values(track.extra),
  ]
    .filter(Boolean)
    .join(" ");

  return normalizeModeLabel(searchableParts);
}

function compareCatalogTracks(
  first: Track,
  second: Track,
  sortOption: CatalogSortOption,
) {
  const compareTitle = CATALOG_COLLATOR.compare(first.title, second.title);
  const compareArtist = CATALOG_COLLATOR.compare(first.artist, second.artist);

  if (sortOption === "year-desc") {
    return second.year - first.year || compareTitle || compareArtist;
  }

  if (sortOption === "year-asc") {
    return first.year - second.year || compareTitle || compareArtist;
  }

  if (sortOption === "title-desc") {
    return -compareTitle || compareArtist || first.year - second.year;
  }

  if (sortOption === "artist-asc") {
    return compareArtist || compareTitle || first.year - second.year;
  }

  if (sortOption === "artist-desc") {
    return -compareArtist || compareTitle || first.year - second.year;
  }

  return compareTitle || compareArtist || first.year - second.year;
}

const EUROVISION_PACK_ID = "eurovision-top-50-2024-2023";

const EUROVISION_PACK_ROWS = [
  "eurovision-2024-switzerland|The Code|Nemo|2024|https://www.youtube.com/watch?v=kiGDvM14Kwg|Switzerland|1º final 2024",
  "eurovision-2024-croatia|Rim Tim Tagi Dim|Baby Lasagna|2024|https://www.youtube.com/watch?v=xTBrVNZtnys|Croatia|2º final 2024",
  "eurovision-2024-ukraine|Teresa & Maria|alyona alyona|2024|https://www.youtube.com/watch?v=k_8cNbF8FLI|Ukraine|3º final 2024",
  "eurovision-2024-france|Mon amour|Slimane|2024|https://www.youtube.com/watch?v=tfoOop2HXxQ|France|4º final 2024",
  "eurovision-2024-israel|Hurricane|Eden Golan|2024|https://www.youtube.com/watch?v=lJYn09tuPw4|Israel|5º final 2024",
  "eurovision-2024-ireland|Doomsday Blue|Bambie Thug|2024|https://www.youtube.com/watch?v=ZGRXRrlIspY|Ireland|6º final 2024",
  "eurovision-2024-italy|La noia|Angelina Mango|2024|https://www.youtube.com/watch?v=TO85laH-ATY|Italy|7º final 2024",
  "eurovision-2024-armenia|Jako|Ladaniva|2024|https://www.youtube.com/watch?v=_6xfmW0Fc40|Armenia|8º final 2024",
  "eurovision-2024-sweden|Unforgettable|Marcus & Martinus|2024|https://www.youtube.com/watch?v=yekc8t0rJqA|Sweden|9º final 2024",
  "eurovision-2024-portugal|Grito|iolanda|2024|https://www.youtube.com/watch?v=K5wDGhcDSpQ|Portugal|10º final 2024",
  "eurovision-2024-greece|ZARI|Marina Satti|2024|https://www.youtube.com/watch?v=uTYalXf184A|Greece|11º final 2024",
  "eurovision-2024-germany|Always on the Run|Isaak Guderian|2024|https://www.youtube.com/watch?v=twhq3S4YHdQ|Germany|12º final 2024",
  "eurovision-2024-luxembourg|Fighter|TALI|2024|https://www.youtube.com/watch?v=6CNuXpdyYmE|Luxembourg|13º final 2024",
  "eurovision-2024-lithuania|Luktelk|Silvester Belt|2024|https://www.youtube.com/watch?v=OrL668EQRu0|Lithuania|14º final 2024",
  "eurovision-2024-cyprus|Liar|Silia Kapsis|2024|https://www.youtube.com/watch?v=8q5QozrtEPA|Cyprus|15º final 2024",
  "eurovision-2024-latvia|Hollow|Dons|2024|https://www.youtube.com/watch?v=p8FNO0DtBng|Latvia|16º final 2024",
  "eurovision-2024-serbia|Ramonda|Teya Dora|2024|https://www.youtube.com/watch?v=tJyBVRBiyKA|Serbia|17º final 2024",
  "eurovision-2024-united-kingdom|Dizzy|Olly Alexander|2024|https://www.youtube.com/watch?v=mvs92WfR8lM|United Kingdom|18º final 2024",
  "eurovision-2024-finland|No Rules!|Windows95Man|2024|https://www.youtube.com/watch?v=8Wi7fhswoBA|Finland|19º final 2024",
  "eurovision-2024-estonia|(nendest) narkootikumidest ei tea me (küll) midagi|5MIINUST|2024|https://www.youtube.com/watch?v=RSMMU2wX0Bk|Estonia|20º final 2024",
  "eurovision-2024-georgia|Firefighter|Nutsa|2024|https://www.youtube.com/watch?v=blMwY8Jabyk|Georgia|21º final 2024",
  "eurovision-2024-spain|ZORRA|Nebulossa|2024|https://www.youtube.com/watch?v=LJFpexlj9Bs|Spain|22º final 2024",
  "eurovision-2024-slovenia|Veronika|Raiven|2024|https://www.youtube.com/watch?v=uWcSsi7SliI|Slovenia|23º final 2024",
  "eurovision-2024-austria|We Will Rave|Kaleen|2024|https://www.youtube.com/watch?v=Kqda15G4T-4|Austria|24º final 2024",
  "eurovision-2024-norway|Ulveham|Gåte|2024|https://www.youtube.com/watch?v=tFj0p2qIgdE|Norway|25º final 2024",
  "eurovision-2023-sweden|Tattoo|Loreen|2023|https://www.youtube.com/watch?v=b3vJfR81xO0|Sweden|1º final 2023",
  "eurovision-2023-finland|Cha Cha Cha|Käärijä|2023|https://www.youtube.com/watch?v=znWi3zN8Ucg|Finland|2º final 2023",
  "eurovision-2023-israel|Unicorn|Noa Kirel|2023|https://www.youtube.com/watch?v=r4wbdKmM3bQ|Israel|3º final 2023",
  "eurovision-2023-italy|Due vite|Marco Mengoni|2023|https://www.youtube.com/watch?v=7e-YeflDxCA|Italy|4º final 2023",
  "eurovision-2023-norway|Queen of Kings|Alessandra|2023|https://www.youtube.com/watch?v=CxNiUxdJnTQ|Norway|5º final 2023",
  "eurovision-2023-ukraine|Heart of Steel|TVORCHI|2023|https://www.youtube.com/watch?v=neIscK1hNxs|Ukraine|6º final 2023",
  "eurovision-2023-belgium|Because of You|Gustaph|2023|https://www.youtube.com/watch?v=ORhEoS6d8e4|Belgium|7º final 2023",
  "eurovision-2023-estonia|Bridges|Alika|2023|https://www.youtube.com/watch?v=wO9g5t3VSuw|Estonia|8º final 2023",
  "eurovision-2023-australia|Promise|Voyager|2023|https://www.youtube.com/watch?v=aqtu2GspT80|Australia|9º final 2023",
  "eurovision-2023-czech-republic|My Sister’s Crown|Vesna|2023|https://www.youtube.com/watch?v=-y78qgDlzAM|Czech Republic|10º final 2023",
  "eurovision-2023-lithuania|Stay (ČIŪTO TŪTO)|Monika Linkytė|2023|https://www.youtube.com/watch?v=68lbEUDuWUQ|Lithuania|11º final 2023",
  "eurovision-2023-cyprus|Break a Broken Heart|Andrew Lambrou|2023|https://www.youtube.com/watch?v=zrFUKqTy4zI|Cyprus|12º final 2023",
  "eurovision-2023-croatia|Mama ŠČ!|Let 3|2023|https://www.youtube.com/watch?v=AyKj8jA0Qoc|Croatia|13º final 2023",
  "eurovision-2023-armenia|Future Lover|Brunette|2023|https://www.youtube.com/watch?v=Co8ZJIejXBA|Armenia|14º final 2023",
  "eurovision-2023-austria|Who the Hell Is Edgar?|TEYA|2023|https://www.youtube.com/watch?v=ZMmLeV47Au4|Austria|15º final 2023",
  "eurovision-2023-france|Évidemment|La Zarra|2023|https://www.youtube.com/watch?v=GWfbEFH9NvQ|France|16º final 2023",
  "eurovision-2023-spain|EAEA|Blanca Paloma|2023|https://www.youtube.com/watch?v=NGnEoSypBhE|Spain|17º final 2023",
  "eurovision-2023-moldova|Soarele şi Luna|Pasha Parfeni|2023|https://www.youtube.com/watch?v=se9LDgFW6ak|Moldova|18º final 2023",
  "eurovision-2023-poland|Solo|Blanka|2023|https://www.youtube.com/watch?v=Jjsl-JCHDWE|Poland|19º final 2023",
  "eurovision-2023-switzerland|Watergun|Remo Forrer|2023|https://www.youtube.com/watch?v=_8-Sbc_GZMc|Switzerland|20º final 2023",
  "eurovision-2023-slovenia|Carpe Diem|Joker Out|2023|https://www.youtube.com/watch?v=zDBSIGITdY4|Slovenia|21º final 2023",
  "eurovision-2023-albania|Duje|Albina Kelmendi|2023|https://www.youtube.com/watch?v=mp8OG4ApocI|Albania|22º final 2023",
  "eurovision-2023-portugal|Ai coração|Mimicat|2023|https://www.youtube.com/watch?v=-uY37gGPkNU|Portugal|23º final 2023",
  "eurovision-2023-serbia|Samo mi se spava|Luke Black|2023|https://www.youtube.com/watch?v=oeIVwYUge8o|Serbia|24º final 2023",
  "eurovision-2023-united-kingdom|I Wrote a Song|Mae Muller|2023|https://www.youtube.com/watch?v=tJ21grjN6wU|United Kingdom|25º final 2023",
] as const;

function parseEurovisionPackTrack(row: string): Track {
  const [id, title, artist, year, audioSrc, country, euroPosition] =
    row.split("|");

  return {
    id,
    title,
    artist,
    year: Number(year),
    mode: "Eurovisión",
    modes: defaultModesForTrack("Eurovisión"),
    audioSrc,
    extra: {
      country,
      euroPosition,
      language: "",
    },
  };
}

const EUROVISION_PACK_50_ALL = EUROVISION_PACK_ROWS.map(parseEurovisionPackTrack);

function getFinalPosition(track: Track) {
  const position = Number.parseInt(track.extra.euroPosition ?? "", 10);
  return Number.isFinite(position) ? position : null;
}

function shouldKeepAutoEurovisionTrack(track: Track) {
  const position = getFinalPosition(track);
  const country = track.extra.country?.trim().toLowerCase();

  return country === "spain" || position === null || position <= 18;
}

const EUROVISION_PACK_50 = EUROVISION_PACK_50_ALL.filter(
  shouldKeepAutoEurovisionTrack,
);

const EUROVISION_CLASSICS_PACK_ID = "eurovision-classics-spanish-44";

const EUROVISION_CLASSICS_PACK_ROWS = [
  "eurovision-classic-2019-netherlands|Arcade|Duncan Laurence|2019|https://www.youtube.com/watch?v=Eztx7Wr8PtE|Netherlands|1º final 2019",
  "eurovision-classic-2018-cyprus|Fuego|Eleni Foureira|2018|https://www.youtube.com/watch?v=eDSgs6syrgg|Cyprus|2º final 2018",
  "eurovision-classic-2018-israel|Toy|Netta|2018|https://www.youtube.com/watch?v=84LBjXaeKk4|Israel|1º final 2018",
  "eurovision-classic-2017-portugal|Amar pelos dois|Salvador Sobral|2017|https://www.youtube.com/watch?v=ymFVfzu-2mw|Portugal|1º final 2017",
  "eurovision-classic-2014-austria|Rise Like a Phoenix|Conchita Wurst|2014|https://www.youtube.com/watch?v=ToqNa0rqUtY|Austria|1º final 2014",
  "eurovision-classic-2014-netherlands|Calm After the Storm|The Common Linnets|2014|https://www.youtube.com/watch?v=hkrF8uC92O4|Netherlands|2º final 2014",
  "eurovision-classic-2012-sweden|Euphoria|Loreen|2012|https://www.youtube.com/watch?v=Pfo-8z86x80|Sweden|1º final 2012",
  "eurovision-classic-2010-germany|Satellite|Lena|2010|https://www.youtube.com/watch?v=8QSgNM9yNjo|Germany|1º final 2010",
  "eurovision-classic-2009-norway|Fairytale|Alexander Rybak|2009|https://www.youtube.com/watch?v=qGQqj6WY4IE|Norway|1º final 2009",
  "eurovision-classic-2007-serbia|Molitva|Marija Šerifović|2007|https://www.youtube.com/watch?v=vWj58UP_ENY|Serbia|1º final 2007",
  "eurovision-classic-2006-finland|Hard Rock Hallelujah|Lordi|2006|https://www.youtube.com/watch?v=gAh9NRGNhUU|Finland|1º final 2006",
  "eurovision-classic-2005-greece|My Number One|Helena Paparizou|2005|https://www.youtube.com/watch?v=rcOwvZ26KFQ|Greece|1º final 2005",
  "eurovision-classic-2004-ukraine|Wild Dances|Ruslana|2004|https://www.youtube.com/watch?v=10XR67NQcAc|Ukraine|1º final 2004",
  "eurovision-classic-2003-turkey|Everyway That I Can|Sertab Erener|2003|https://www.youtube.com/watch?v=j0_QrKnqd5E|Turkey|1º final 2003",
  "eurovision-classic-1998-israel|Diva|Dana International|1998|https://www.youtube.com/watch?v=4No1oClTp_E|Israel|1º final 1998",
  "eurovision-classic-1997-united-kingdom|Love Shine a Light|Katrina and the Waves|1997|https://www.youtube.com/watch?v=KwLBCKA5-ls|United Kingdom|1º final 1997",
  "eurovision-classic-1996-ireland|The Voice|Eimear Quinn|1996|https://www.youtube.com/watch?v=0KiE1byYXtA|Ireland|1º final 1996",
  "eurovision-classic-1995-norway|Nocturne|Secret Garden|1995|https://www.youtube.com/watch?v=u-gA0aU-d88|Norway|1º final 1995",
  "eurovision-classic-1988-switzerland|Ne partez pas sans moi|Céline Dion|1988|https://www.youtube.com/watch?v=VXLWfXmlXPc|Switzerland|1º final 1988",
  "eurovision-classic-1987-ireland|Hold Me Now|Johnny Logan|1987|https://www.youtube.com/watch?v=gl2yKH5zbyo|Ireland|1º final 1987",
  "eurovision-classic-1984-sweden|Diggi-loo-diggi-ley|Herreys|1984|https://www.youtube.com/watch?v=ySOCalwr6Yo|Sweden|1º final 1984",
  "eurovision-classic-1982-germany|Ein bisschen Frieden|Nicole|1982|https://www.youtube.com/watch?v=hp_b-095yPc|Germany|1º final 1982",
  "eurovision-classic-1981-united-kingdom|Making Your Mind Up|Bucks Fizz|1981|https://www.youtube.com/watch?v=DszqGGSY4oo|United Kingdom|1º final 1981",
  "eurovision-classic-1979-israel|Hallelujah|Milk and Honey|1979|https://www.youtube.com/watch?v=vvmHIhhlzOA|Israel|1º final 1979",
  "eurovision-classic-1978-israel|A-Ba-Ni-Bi|Izhar Cohen|1978|https://www.youtube.com/watch?v=HdmfwKUpDlg|Israel|1º final 1978",
  "eurovision-classic-1974-sweden|Waterloo|ABBA|1974|https://www.youtube.com/watch?v=kfYp3HLHuA4|Sweden|1º final 1974",
  "eurovision-classic-1973-luxembourg|Tu te reconnaitras|Anne Marie David|1973|https://www.youtube.com/watch?v=ECDvAMyqX5w|Luxembourg|1º final 1973",
  "eurovision-classic-1958-italy|Nel blu dipinto di blu (Volare)|Domenico Modugno|1958|https://www.youtube.com/watch?v=v2HKRAtUKNw|Italy|3º final 1958",
  "eurovision-classic-2022-spain|SloMo|Chanel|2022|https://www.youtube.com/watch?v=N3eiW6E0ldc|Spain|3º final 2022",
  "eurovision-classic-2012-spain|Quédate conmigo (Stay With Me)|Pastora Soler|2012|https://www.youtube.com/watch?v=eJBh_fUBreA|Spain|10º final 2012",
  "eurovision-classic-2010-spain|Algo pequeñito (Something Tiny)|Daniel Diges|2010|https://www.youtube.com/watch?v=6gltZu8lsFc|Spain|15º final 2010",
  "eurovision-classic-2008-spain|Baila el Chiki Chiki|Rodolfo Chikilicuatre|2008|https://www.youtube.com/watch?v=wfeCIvOxXBo|Spain|16º final 2008",
  "eurovision-classic-2003-spain|Dime|Beth|2003|https://www.youtube.com/watch?v=WRlwL7X_jE8|Spain|8º final 2003",
  "eurovision-classic-2002-spain|Europe’s Living a Celebration|Rosa López|2002|https://www.youtube.com/watch?v=hZC-SD7jZ-U|Spain|7º final 2002",
  "eurovision-classic-1995-spain|Vuelve conmigo|Anabel Conde|1995|https://www.youtube.com/watch?v=vVkdF17DENg|Spain|2º final 1995",
  "eurovision-classic-1991-spain|Bailar pegados|Sergio Dalma|1991|https://www.youtube.com/watch?v=4EGAIciJ76U|Spain|4º final 1991",
  "eurovision-classic-1990-spain|Bandido|Azúcar Moreno|1990|https://www.youtube.com/watch?v=7dGysPC_q9k|Spain|5º final 1990",
  "eurovision-classic-1989-spain|Nacida para amar|Nina|1989|https://www.youtube.com/watch?v=MUd0TxLz7zg|Spain|6º final 1989",
  "eurovision-classic-1983-spain|Quién maneja mi barca|Remedios Amaya|1983|https://www.youtube.com/watch?v=B3-0DLbQP2E|Spain|19º final 1983",
  "eurovision-classic-1979-spain|Su canción|Betty Missiego|1979|https://www.youtube.com/watch?v=cCDCQcDzbgs|Spain|2º final 1979",
  "eurovision-classic-1973-spain|Eres tú|Mocedades|1973|https://www.youtube.com/watch?v=LkNjk4x4-Wo|Spain|2º final 1973",
  "eurovision-classic-1971-spain|En un mundo nuevo|Karina|1971|https://www.youtube.com/watch?v=V_os2IZ7tUI|Spain|2º final 1971",
  "eurovision-classic-1969-spain|Vivo cantando|Salomé|1969|https://www.youtube.com/watch?v=POj0U2W6MnE|Spain|1º final 1969",
  "eurovision-classic-1968-spain|La, la, la|Massiel|1968|https://www.youtube.com/watch?v=JhPAZOwEY0I|Spain|1º final 1968",
] as const;

const EUROVISION_CLASSICS_PACK_ALL = EUROVISION_CLASSICS_PACK_ROWS.map(
  parseEurovisionPackTrack,
);

const EUROVISION_CLASSICS_PACK = EUROVISION_CLASSICS_PACK_ALL.filter(
  shouldKeepAutoEurovisionTrack,
);

const PRUNED_EUROVISION_TRACK_IDS = new Set(
  [...EUROVISION_PACK_50_ALL, ...EUROVISION_CLASSICS_PACK_ALL]
    .filter((track) => !shouldKeepAutoEurovisionTrack(track))
    .map((track) => track.id),
);

const EUROVISION_PACKS = [
  { id: EUROVISION_PACK_ID, tracks: EUROVISION_PACK_50 },
  { id: EUROVISION_CLASSICS_PACK_ID, tracks: EUROVISION_CLASSICS_PACK },
] as const;

const GLOBAL_HITS_PACK_ID = "global-hits-150-2026-08-15";

const GLOBAL_HITS_PACK_ROWS = [
  "global-hit-john-legend-all-of-me|All of Me|John Legend|2013|https://www.youtube.com/watch?v=450p7goxZqg",
  "global-hit-adele-someone-like-you|Someone Like You|Adele|2011|https://www.youtube.com/watch?v=hLQl3WQQoQ0",
  "global-hit-adele-rolling-in-the-deep|Rolling in the Deep|Adele|2010|https://www.youtube.com/watch?v=rYEDA3JcQqw",
  "global-hit-adele-hello|Hello|Adele|2015|https://www.youtube.com/watch?v=YQHsXMglC9A",
  "global-hit-adele-set-fire-to-the-rain|Set Fire to the Rain|Adele|2011|https://www.youtube.com/watch?v=a2giXO6eyuI",
  "global-hit-adele-easy-on-me|Easy On Me|Adele|2021|https://www.youtube.com/watch?v=U3ASj1L6_sY",
  "global-hit-adele-skyfall|Skyfall|Adele|2012|https://www.youtube.com/watch?v=DeumyOzKqgI",
  "global-hit-billie-eilish-bad-guy|bad guy|Billie Eilish|2019|https://www.youtube.com/watch?v=DyDfgMOUjCI",
  "global-hit-billie-eilish-ocean-eyes|Ocean Eyes|Billie Eilish|2016|https://www.youtube.com/watch?v=viimfQi_pUw",
  "global-hit-billie-eilish-everything-i-wanted|everything i wanted|Billie Eilish|2019|https://www.youtube.com/watch?v=EgBJmlPo8Xw",
  "global-hit-billie-eilish-happier-than-ever|Happier Than Ever|Billie Eilish|2021|https://www.youtube.com/watch?v=5GJWxDKyk3A",
  "global-hit-billie-eilish-what-was-i-made-for|What Was I Made For?|Billie Eilish|2023|https://www.youtube.com/watch?v=cW8VLC9nnTo",
  "global-hit-lady-gaga-bad-romance|Bad Romance|Lady Gaga|2009|https://www.youtube.com/watch?v=qrO4YZeyl0I",
  "global-hit-lady-gaga-poker-face|Poker Face|Lady Gaga|2008|https://www.youtube.com/watch?v=bESGLojNYSo",
  "global-hit-lady-gaga-and-bradley-cooper-shallow|Shallow|Lady Gaga and Bradley Cooper|2018|https://www.youtube.com/watch?v=bo_efYhYU2A",
  "global-hit-lady-gaga-born-this-way|Born This Way|Lady Gaga|2011|https://www.youtube.com/watch?v=wV1FrqwZyKw",
  "global-hit-lady-gaga-alejandro|Alejandro|Lady Gaga|2009|https://www.youtube.com/watch?v=niqrrmev4mA",
  "global-hit-lady-gaga-paparazzi|Paparazzi|Lady Gaga|2008|https://www.youtube.com/watch?v=d2smz_1L2_0",
  "global-hit-lady-gaga-and-beyonce-telephone|Telephone|Lady Gaga and Beyonce|2010|https://www.youtube.com/watch?v=EVBsypHzF3U",
  "global-hit-madonna-like-a-prayer|Like a Prayer|Madonna|1989|https://www.youtube.com/watch?v=79fzeNUqQbQ",
  "global-hit-madonna-vogue|Vogue|Madonna|1990|https://www.youtube.com/watch?v=p0jfTzqBi6I",
  "global-hit-madonna-like-a-virgin|Like a Virgin|Madonna|1984|https://www.youtube.com/watch?v=s__rX_WL100",
  "global-hit-madonna-hung-up|Hung Up|Madonna|2005|https://www.youtube.com/watch?v=EDwb9jOVRtU",
  "global-hit-madonna-material-girl|Material Girl|Madonna|1984|https://www.youtube.com/watch?v=6p-lDYPR2P8",
  "global-hit-madonna-la-isla-bonita|La Isla Bonita|Madonna|1986|https://www.youtube.com/watch?v=zpzdgmqIHOQ",
  "global-hit-ariana-grande-thank-u-next|thank u, next|Ariana Grande|2018|https://www.youtube.com/watch?v=gl1aHhXnN1k",
  "global-hit-ariana-grande-7-rings|7 rings|Ariana Grande|2019|https://www.youtube.com/watch?v=QYh6mYIJG2Y",
  "global-hit-ariana-grande-ft-iggy-azalea-problem|Problem|Ariana Grande ft. Iggy Azalea|2014|https://www.youtube.com/watch?v=iS1g8G_njx8",
  "global-hit-ariana-grande-into-you|Into You|Ariana Grande|2016|https://www.youtube.com/watch?v=1ekZEVeXwek",
  "global-hit-ariana-grande-no-tears-left-to-cry|no tears left to cry|Ariana Grande|2018|https://www.youtube.com/watch?v=ffxKSjUwKdU",
  "global-hit-ariana-grande-ft-zedd-break-free|Break Free|Ariana Grande ft. Zedd|2014|https://www.youtube.com/watch?v=L8eRzOYhLuw",
  "global-hit-ariana-grande-dangerous-woman|Dangerous Woman|Ariana Grande|2016|https://www.youtube.com/watch?v=9WbCfHutDSE",
  "global-hit-ariana-grande-one-last-time|One Last Time|Ariana Grande|2014|https://www.youtube.com/watch?v=BPgEgaPk62M",
  "global-hit-the-weeknd-blinding-lights|Blinding Lights|The Weeknd|2019|https://www.youtube.com/watch?v=4NRXx6U8ABQ",
  "global-hit-the-weeknd-ft-daft-punk-starboy|Starboy|The Weeknd ft. Daft Punk|2016|https://www.youtube.com/watch?v=34Na4j8AVgA",
  "global-hit-the-weeknd-can-t-feel-my-face|Can't Feel My Face|The Weeknd|2015|https://www.youtube.com/watch?v=KEI4qSrkPAs",
  "global-hit-ed-sheeran-shape-of-you|Shape of You|Ed Sheeran|2017|https://www.youtube.com/watch?v=JGwWNGJdvx8",
  "global-hit-ed-sheeran-thinking-out-loud|Thinking Out Loud|Ed Sheeran|2014|https://www.youtube.com/watch?v=lp-EO5I60KA",
  "global-hit-ed-sheeran-perfect|Perfect|Ed Sheeran|2017|https://www.youtube.com/watch?v=2Vv-BfVoq4g",
  "global-hit-ed-sheeran-photograph|Photograph|Ed Sheeran|2014|https://www.youtube.com/watch?v=nSDgHBxUbVQ",
  "global-hit-justin-bieber-love-yourself|Love Yourself|Justin Bieber|2015|https://www.youtube.com/watch?v=oyEuk8j8imI",
  "global-hit-justin-bieber-sorry|Sorry|Justin Bieber|2015|https://www.youtube.com/watch?v=fRh_vgS2dFE",
  "global-hit-justin-bieber-what-do-you-mean|What Do You Mean?|Justin Bieber|2015|https://www.youtube.com/watch?v=DK_0jXPuIr0",
  "global-hit-justin-bieber-ft-ludacris-baby|Baby|Justin Bieber ft. Ludacris|2010|https://www.youtube.com/watch?v=kffacxfA7G4",
  "global-hit-dua-lipa-levitating|Levitating|Dua Lipa|2020|https://www.youtube.com/watch?v=TUVcZfQe-Kw",
  "global-hit-dua-lipa-don-t-start-now|Don't Start Now|Dua Lipa|2019|https://www.youtube.com/watch?v=oygrmJFKYZY",
  "global-hit-dua-lipa-new-rules|New Rules|Dua Lipa|2017|https://www.youtube.com/watch?v=k2qgadSvNyU",
  "global-hit-dua-lipa-dance-the-night|Dance The Night|Dua Lipa|2023|https://www.youtube.com/watch?v=OiC1rgCPmUQ",
  "global-hit-miley-cyrus-flowers|Flowers|Miley Cyrus|2023|https://www.youtube.com/watch?v=G7KNmW9a75Y",
  "global-hit-miley-cyrus-wrecking-ball|Wrecking Ball|Miley Cyrus|2013|https://www.youtube.com/watch?v=My2FRPA3Gf8",
  "global-hit-miley-cyrus-party-in-the-u-s-a|Party in the U.S.A.|Miley Cyrus|2009|https://www.youtube.com/watch?v=M11SvDtPBhA",
  "global-hit-taylor-swift-shake-it-off|Shake It Off|Taylor Swift|2014|https://www.youtube.com/watch?v=nfWlot6h_JM",
  "global-hit-taylor-swift-blank-space|Blank Space|Taylor Swift|2014|https://www.youtube.com/watch?v=e-ORhEE9VVg",
  "global-hit-taylor-swift-love-story|Love Story|Taylor Swift|2008|https://www.youtube.com/watch?v=8xg3vE8Ie_E",
  "global-hit-taylor-swift-you-belong-with-me|You Belong With Me|Taylor Swift|2008|https://www.youtube.com/watch?v=VuNIsY6JdUw",
  "global-hit-taylor-swift-anti-hero|Anti-Hero|Taylor Swift|2022|https://www.youtube.com/watch?v=b1kbLwvqugk",
  "global-hit-taylor-swift-i-knew-you-were-trouble|I Knew You Were Trouble|Taylor Swift|2012|https://www.youtube.com/watch?v=vNoKguSdy4Y",
  "global-hit-katy-perry-roar|Roar|Katy Perry|2013|https://www.youtube.com/watch?v=CevxZvSJLk8",
  "global-hit-katy-perry-firework|Firework|Katy Perry|2010|https://www.youtube.com/watch?v=QGJuMBdaqIw",
  "global-hit-katy-perry-ft-juicy-j-dark-horse|Dark Horse|Katy Perry ft. Juicy J|2013|https://www.youtube.com/watch?v=0KSOMA3QBU0",
  "global-hit-katy-perry-teenage-dream|Teenage Dream|Katy Perry|2010|https://www.youtube.com/watch?v=98WtmW-lfeE",
  "global-hit-katy-perry-i-kissed-a-girl|I Kissed a Girl|Katy Perry|2008|https://www.youtube.com/watch?v=tAp9BKosZXs",
  "global-hit-beyonce-halo|Halo|Beyonce|2008|https://www.youtube.com/watch?v=bnVUHWCynig",
  "global-hit-beyonce-single-ladies|Single Ladies|Beyonce|2008|https://www.youtube.com/watch?v=4m1EFMoRFvY",
  "global-hit-beyonce-ft-jay-z-crazy-in-love|Crazy in Love|Beyonce ft. Jay-Z|2003|https://www.youtube.com/watch?v=ViwtNLUqkMY",
  "global-hit-beyonce-if-i-were-a-boy|If I Were a Boy|Beyonce|2008|https://www.youtube.com/watch?v=AWpsOqh8q0M",
  "global-hit-rihanna-ft-jay-z-umbrella|Umbrella|Rihanna ft. Jay-Z|2007|https://www.youtube.com/watch?v=CvBfHwUxHIk",
  "global-hit-rihanna-diamonds|Diamonds|Rihanna|2012|https://www.youtube.com/watch?v=lWA2pjMjpBs",
  "global-hit-rihanna-ft-calvin-harris-we-found-love|We Found Love|Rihanna ft. Calvin Harris|2011|https://www.youtube.com/watch?v=tg00YEETFzg",
  "global-hit-rihanna-ft-mikky-ekko-stay|Stay|Rihanna ft. Mikky Ekko|2012|https://www.youtube.com/watch?v=JF8BRvqGCNs",
  "global-hit-mark-ronson-ft-bruno-mars-uptown-funk|Uptown Funk|Mark Ronson ft. Bruno Mars|2014|https://www.youtube.com/watch?v=OPf0YbXqDm0",
  "global-hit-bruno-mars-just-the-way-you-are|Just the Way You Are|Bruno Mars|2010|https://www.youtube.com/watch?v=LjhCEhWiKXk",
  "global-hit-bruno-mars-locked-out-of-heaven|Locked Out of Heaven|Bruno Mars|2012|https://www.youtube.com/watch?v=e-fA-gBCkj0",
  "global-hit-bruno-mars-when-i-was-your-man|When I Was Your Man|Bruno Mars|2012|https://www.youtube.com/watch?v=ekzHIouo8Q4",
  "global-hit-bruno-mars-grenade|Grenade|Bruno Mars|2010|https://www.youtube.com/watch?v=SR6iYWJxHqs",
  "global-hit-bruno-mars-that-s-what-i-like|That's What I Like|Bruno Mars|2016|https://www.youtube.com/watch?v=PMivT7MJ41M",
  "global-hit-pharrell-williams-happy|Happy|Pharrell Williams|2013|https://www.youtube.com/watch?v=ZbZSe6N_BXs",
  "global-hit-daft-punk-ft-pharrell-williams-get-lucky|Get Lucky|Daft Punk ft. Pharrell Williams|2013|https://www.youtube.com/watch?v=5NV6Rdv1a3I",
  "global-hit-gotye-ft-kimbra-somebody-that-i-used-to-know|Somebody That I Used To Know|Gotye ft. Kimbra|2011|https://www.youtube.com/watch?v=8UVNT4wvIGY",
  "global-hit-hozier-take-me-to-church|Take Me To Church|Hozier|2013|https://www.youtube.com/watch?v=PVjiKRfKpPI",
  "global-hit-passenger-let-her-go|Let Her Go|Passenger|2012|https://www.youtube.com/watch?v=RBumgq5yVrA",
  "global-hit-the-lumineers-ho-hey|Ho Hey|The Lumineers|2012|https://www.youtube.com/watch?v=zvCBSSwgtg4",
  "global-hit-imagine-dragons-radioactive|Radioactive|Imagine Dragons|2012|https://www.youtube.com/watch?v=ktvTqknDobU",
  "global-hit-imagine-dragons-demons|Demons|Imagine Dragons|2012|https://www.youtube.com/watch?v=mWRsgZuwf_8",
  "global-hit-imagine-dragons-believer|Believer|Imagine Dragons|2017|https://www.youtube.com/watch?v=7wtfhZwyrcc",
  "global-hit-coldplay-viva-la-vida|Viva La Vida|Coldplay|2008|https://www.youtube.com/watch?v=dvgZkm1xWPE",
  "global-hit-coldplay-yellow|Yellow|Coldplay|2000|https://www.youtube.com/watch?v=yKNxeF4KMsY",
  "global-hit-coldplay-fix-you|Fix You|Coldplay|2005|https://www.youtube.com/watch?v=k4V3Mo61fJM",
  "global-hit-coldplay-paradise|Paradise|Coldplay|2011|https://www.youtube.com/watch?v=1G4isv_Fylg",
  "global-hit-coldplay-clocks|Clocks|Coldplay|2002|https://www.youtube.com/watch?v=d020hcWA_Wg",
  "global-hit-oasis-wonderwall|Wonderwall|Oasis|1995|https://www.youtube.com/watch?v=bx1Bh8ZvH84",
  "global-hit-oasis-don-t-look-back-in-anger|Don't Look Back in Anger|Oasis|1995|https://www.youtube.com/watch?v=r8OipmKFDeM",
  "global-hit-nirvana-smells-like-teen-spirit|Smells Like Teen Spirit|Nirvana|1991|https://www.youtube.com/watch?v=hTWKbfoikeg",
  "global-hit-r-e-m-losing-my-religion|Losing My Religion|R.E.M.|1991|https://www.youtube.com/watch?v=xwtdhWltSIg",
  "global-hit-radiohead-creep|Creep|Radiohead|1992|https://www.youtube.com/watch?v=XFkzRNyygfk",
  "global-hit-the-cranberries-zombie|Zombie|The Cranberries|1994|https://www.youtube.com/watch?v=6Ejga4kJUts",
  "global-hit-fleetwood-mac-dreams|Dreams|Fleetwood Mac|1977|https://www.youtube.com/watch?v=Y3ywicffOj4",
  "global-hit-guns-n-roses-sweet-child-o-mine|Sweet Child O' Mine|Guns N' Roses|1987|https://www.youtube.com/watch?v=1w7OgIMMRc4",
  "global-hit-bon-jovi-livin-on-a-prayer|Livin' on a Prayer|Bon Jovi|1986|https://www.youtube.com/watch?v=lDK9QqIzhwk",
  "global-hit-queen-bohemian-rhapsody|Bohemian Rhapsody|Queen|1975|https://www.youtube.com/watch?v=fJ9rUzIMcZQ",
  "global-hit-queen-don-t-stop-me-now|Don't Stop Me Now|Queen|1978|https://www.youtube.com/watch?v=HgzGwKwLmgM",
  "global-hit-queen-somebody-to-love|Somebody to Love|Queen|1976|https://www.youtube.com/watch?v=kijpcUv-b8M",
  "global-hit-michael-jackson-billie-jean|Billie Jean|Michael Jackson|1982|https://www.youtube.com/watch?v=Zi_XLOBDo_Y",
  "global-hit-michael-jackson-thriller|Thriller|Michael Jackson|1982|https://www.youtube.com/watch?v=sOnqjkJTMaA",
  "global-hit-michael-jackson-beat-it|Beat It|Michael Jackson|1982|https://www.youtube.com/watch?v=oRdxUFDoQe0",
  "global-hit-whitney-houston-i-will-always-love-you|I Will Always Love You|Whitney Houston|1992|https://www.youtube.com/watch?v=3JWTaaS7LdU",
  "global-hit-celine-dion-my-heart-will-go-on|My Heart Will Go On|Celine Dion|1997|https://www.youtube.com/watch?v=FHG2oizTlpY",
  "global-hit-cher-believe|Believe|Cher|1998|https://www.youtube.com/watch?v=nZXRV4MezEw",
  "global-hit-backstreet-boys-i-want-it-that-way|I Want It That Way|Backstreet Boys|1999|https://www.youtube.com/watch?v=4fndeDfaWCg",
  "global-hit-britney-spears-toxic|Toxic|Britney Spears|2003|https://www.youtube.com/watch?v=LOZuxwVk7TU",
  "global-hit-britney-spears-oops-i-did-it-again|Oops!... I Did It Again|Britney Spears|2000|https://www.youtube.com/watch?v=CduA0TULnow",
  "global-hit-britney-spears-baby-one-more-time|...Baby One More Time|Britney Spears|1998|https://www.youtube.com/watch?v=C-u5WLJ9Yk4",
  "global-hit-kylie-minogue-can-t-get-you-out-of-my-head|Can't Get You Out of My Head|Kylie Minogue|2001|https://www.youtube.com/watch?v=c18441Eh_WE",
  "global-hit-luis-fonsi-ft-daddy-yankee-despacito|Despacito|Luis Fonsi ft. Daddy Yankee|2017|https://www.youtube.com/watch?v=kJQP7kiw5Fk",
  "global-hit-enrique-iglesias-ft-descemer-bueno-and-gente-de-zona-bailando|Bailando|Enrique Iglesias ft. Descemer Bueno and Gente de Zona|2014|https://www.youtube.com/watch?v=nM2SZqDqfwY",
  "global-hit-shakira-ft-wyclef-jean-hips-don-t-lie|Hips Don't Lie|Shakira ft. Wyclef Jean|2005|https://www.youtube.com/watch?v=DUT5rEU6pqM",
  "global-hit-shakira-waka-waka|Waka Waka|Shakira|2010|https://www.youtube.com/watch?v=pRpeEdMmmQ0",
  "global-hit-shakira-ft-alejandro-sanz-la-tortura|La Tortura|Shakira ft. Alejandro Sanz|2005|https://www.youtube.com/watch?v=Dsp_8Lm1eSk",
  "global-hit-shakira-antologia|Antología|Shakira|1995|https://www.youtube.com/watch?v=pWgVRK_Ggww",
  "global-hit-karol-g-and-nicki-minaj-tusa|Tusa|Karol G and Nicki Minaj|2019|https://www.youtube.com/watch?v=tbneQDc2H3I",
  "global-hit-karol-g-provenza|Provenza|Karol G|2022|https://www.youtube.com/watch?v=ca48oMV59LU",
  "global-hit-karol-g-bichota|Bichota|Karol G|2020|https://www.youtube.com/watch?v=Q45aO8ea-Jo",
  "global-hit-j-balvin-and-willy-william-mi-gente|Mi Gente|J Balvin and Willy William|2017|https://www.youtube.com/watch?v=wnJ6LuUFpMo",
  "global-hit-j-balvin-ay-vamos|Ay Vamos|J Balvin|2014|https://www.youtube.com/watch?v=TapXs54Ah3E",
  "global-hit-maluma-felices-los-4|Felices los 4|Maluma|2017|https://www.youtube.com/watch?v=NLN0NiOFWSs",
  "global-hit-maluma-hawai|Hawái|Maluma|2020|https://www.youtube.com/watch?v=pK060iUFWXg",
  "global-hit-marc-anthony-vivir-mi-vida|Vivir Mi Vida|Marc Anthony|2013|https://www.youtube.com/watch?v=YXnjy5YlDwk",
  "global-hit-don-omar-ft-lucenzo-danza-kuduro|Danza Kuduro|Don Omar ft. Lucenzo|2010|https://www.youtube.com/watch?v=7zp1TbLFPp8",
  "global-hit-daddy-yankee-gasolina|Gasolina|Daddy Yankee|2004|https://www.youtube.com/watch?v=CCF1_jI8Prk",
  "global-hit-bad-bunny-and-jhay-cortez-dakiti|Dákiti|Bad Bunny and Jhay Cortez|2020|https://www.youtube.com/watch?v=TmKh7lAwnBI",
  "global-hit-bad-bunny-titi-me-pregunto|Tití Me Preguntó|Bad Bunny|2022|https://www.youtube.com/watch?v=Cr8K88UcO0s",
  "global-hit-bad-bunny-and-chencho-corleone-me-porto-bonito|Me Porto Bonito|Bad Bunny and Chencho Corleone|2022|https://www.youtube.com/watch?v=saGYMhApaH8",
  "global-hit-juanes-la-camisa-negra|La Camisa Negra|Juanes|2004|https://www.youtube.com/watch?v=dH0tcQV1gMc",
  "global-hit-juanes-a-dios-le-pido|A Dios le Pido|Juanes|2002|https://www.youtube.com/watch?v=kMIaYXxLnUA",
  "global-hit-diego-torres-color-esperanza|Color Esperanza|Diego Torres|2001|https://www.youtube.com/watch?v=Nb1VOQRs-Vs",
  "global-hit-alejandro-sanz-corazon-partio|Corazón Partío|Alejandro Sanz|1997|https://www.youtube.com/watch?v=YxFUwGaxKTo",
  "global-hit-alejandro-sanz-amiga-mia|Amiga mía|Alejandro Sanz|1997|https://www.youtube.com/watch?v=Gfhh-p6OqZU",
  "global-hit-mana-rayando-el-sol|Rayando el Sol|Maná|1990|https://www.youtube.com/watch?v=8lbsQyMhMT8",
  "global-hit-mana-vivir-sin-aire|Vivir Sin Aire|Maná|1992|https://www.youtube.com/watch?v=g3uxeG1rrlE",
  "global-hit-julieta-venegas-limon-y-sal|Limón y Sal|Julieta Venegas|2006|https://www.youtube.com/watch?v=tIpzfs5tBJU",
  "global-hit-julieta-venegas-me-voy|Me Voy|Julieta Venegas|2006|https://www.youtube.com/watch?v=y8rBC6GCUjg",
  "global-hit-jarabe-de-palo-la-flaca|La Flaca|Jarabe de Palo|1996|https://www.youtube.com/watch?v=r2g0pM3PMNQ",
  "global-hit-jarabe-de-palo-depende|Depende|Jarabe de Palo|1998|https://www.youtube.com/watch?v=UmR05G96Myc",
  "global-hit-fito-and-fitipaldis-soldadito-marinero|Soldadito Marinero|Fito & Fitipaldis|2003|https://www.youtube.com/watch?v=GxQjx7FkmNA",
  "global-hit-despistaos-fisica-o-quimica|Física o Química|Despistaos|2008|https://www.youtube.com/watch?v=oUcVDkTEY_Q",
  "global-hit-david-bisbal-ave-maria|Ave María|David Bisbal|2002|https://www.youtube.com/watch?v=CH5KNqtTnyk",
  "global-hit-david-bisbal-buleria|Bulería|David Bisbal|2004|https://www.youtube.com/watch?v=xYWxF5VKI0E",
  "global-hit-maria-isabel-antes-muerta-que-sencilla|Antes muerta que sencilla|María Isabel|2004|https://www.youtube.com/watch?v=AV3LlZzwr-g",
  "global-hit-las-ketchup-asereje|Aserejé|Las Ketchup|2002|https://www.youtube.com/watch?v=V0PisGe66mY",
  "global-hit-los-del-rio-macarena|Macarena|Los Del Río|1993|https://www.youtube.com/watch?v=zWaymcVmJ-A",
] as const;

const GLOBAL_SPANISH_HITS_PACK_ID = "global-spanish-hits-150-2026-08-15-v2";

const GLOBAL_SPANISH_HITS_PACK_ROWS = [
  "global-hit-es-aitana-telefono|Teléfono|Aitana|2018|https://www.youtube.com/watch?v=bHTfTPIMnaw",
  "global-hit-es-aitana-con-la-miel-en-los-labios|Con la miel en los labios|Aitana|2019|https://www.youtube.com/watch?v=hD4W1UktL9E",
  "global-hit-es-aitana-y-nicki-nicole-formentera|Formentera|Aitana y Nicki Nicole|2021|https://www.youtube.com/watch?v=9YqlmvpWLUg",
  "global-hit-es-aitana-en-el-coche|En el coche|Aitana|2022|https://www.youtube.com/watch?v=l66Ub-GZ578",
  "global-hit-es-aitana-los-angeles|Los Ángeles|Aitana|2023|https://www.youtube.com/watch?v=XUctUGKs1Sc",
  "global-hit-es-aitana-las-babys|Las Babys|Aitana|2023|https://www.youtube.com/watch?v=02d2P0KZWDk",
  "global-hit-es-aitana-berlin|Berlín|Aitana|2021|https://www.youtube.com/watch?v=ZenLKSPBpHo",
  "global-hit-es-morat-y-aitana-presiento|Presiento|Morat y Aitana|2019|https://www.youtube.com/watch?v=YLM19xmD8XE",
  "global-hit-es-amaia-y-aitana-la-cancion-que-no-quiero-cantarte|La canción que no quiero cantarte|Amaia y Aitana|2022|https://www.youtube.com/watch?v=TtZdKaMecHY",
  "global-hit-es-amaia-el-relampago|El Relámpago|Amaia|2019|https://www.youtube.com/watch?v=PeU5u4cpER8",
  "global-hit-es-amaia-quiero-que-vengas|Quiero que vengas|Amaia|2021|https://www.youtube.com/watch?v=9HfoNUjw5u8",
  "global-hit-es-amaia-bienvenidos-al-show|Bienvenidos al show|Amaia|2022|https://www.youtube.com/watch?v=DfhjLszBll8",
  "global-hit-es-amaia-yamaguchi|Yamaguchi|Amaia|2022|https://www.youtube.com/watch?v=bv1aCVPdshs",
  "global-hit-es-amaia-nuevo-verano|Nuevo verano|Amaia|2019|https://www.youtube.com/watch?v=UQ9QvM2zt6Y",
  "global-hit-es-amaia-nanai|Nanai|Amaia|2023|https://www.youtube.com/watch?v=o9rrg9Ri3Mk",
  "global-hit-es-morat-como-te-atreves|Cómo te atreves|Morat|2016|https://www.youtube.com/watch?v=_gm5piKnrS4",
  "global-hit-es-morat-cuando-nadie-ve|Cuando nadie ve|Morat|2018|https://www.youtube.com/watch?v=RQOItdGRxbg",
  "global-hit-es-morat-y-juanes-besos-en-guerra|Besos en guerra|Morat y Juanes|2017|https://www.youtube.com/watch?v=1oeD2m2UQAI",
  "global-hit-es-morat-no-se-va|No se va|Morat|2018|https://www.youtube.com/watch?v=USDX0X-d588",
  "global-hit-es-morat-amor-con-hielo|Amor con hielo|Morat|2017|https://www.youtube.com/watch?v=1P5eDa_Kn2M",
  "global-hit-es-morat-a-donde-vamos|A dónde vamos|Morat|2021|https://www.youtube.com/watch?v=TYrcdhots80",
  "global-hit-es-morat-debi-suponerlo|Debí suponerlo|Morat|2019|https://www.youtube.com/watch?v=X6L2Rp-ZCa0",
  "global-hit-es-morat-y-sebastian-yatra-date-la-vuelta|Date la vuelta|Morat y Sebastián Yatra|2019|https://www.youtube.com/watch?v=6RcK77Jcqdc",
  "global-hit-es-morat-aprender-a-quererte|Aprender a quererte|Morat|2015|https://www.youtube.com/watch?v=yONsiHfoMSc",
  "global-hit-es-morat-y-juanes-506|506|Morat y Juanes|2022|https://www.youtube.com/watch?v=U2fvemxwW1M",
  "global-hit-es-morat-y-duki-paris|París|Morat y Duki|2022|https://www.youtube.com/watch?v=cHsKzdyXDH0",
  "global-hit-es-morat-feo|Feo|Morat|2023|https://www.youtube.com/watch?v=uE5pTMfxjBU",
  "global-hit-es-bizarrap-y-quevedo-quedate|Quédate|Bizarrap y Quevedo|2022|https://www.youtube.com/watch?v=1orKsZ8yKhk",
  "global-hit-es-quevedo-columbia|Columbia|Quevedo|2023|https://www.youtube.com/watch?v=QlZNGcVfeF0",
  "global-hit-es-quevedo-y-myke-towers-playa-del-ingles|Playa del Inglés|Quevedo y Myke Towers|2022|https://www.youtube.com/watch?v=yYVCf-y2YmE",
  "global-hit-es-quevedo-vista-al-mar|Vista al mar|Quevedo|2022|https://www.youtube.com/watch?v=1Rgc58HftaE",
  "global-hit-es-quevedo-punto-g|Punto G|Quevedo|2022|https://www.youtube.com/watch?v=z8uyayN3RbE",
  "global-hit-es-lola-indigo-y-quevedo-el-tonto|El tonto|Lola Indigo y Quevedo|2023|https://www.youtube.com/watch?v=4G8bm3zz1ck",
  "global-hit-es-quevedo-ahora-que|Ahora qué|Quevedo|2023|https://www.youtube.com/watch?v=M87J2vz9UZk",
  "global-hit-es-quevedo-y-ovy-on-the-drums-sin-senal|Sin señal|Quevedo y Ovy On The Drums|2022|https://www.youtube.com/watch?v=hFLlXUUVnyk",
  "global-hit-es-amaral-sin-ti-no-soy-nada|Sin ti no soy nada|Amaral|2002|https://www.youtube.com/watch?v=6b9AHPopkXw",
  "global-hit-es-amaral-moriria-por-vos|Moriría por vos|Amaral|2004|https://www.youtube.com/watch?v=eVc2VDQbV1o",
  "global-hit-es-amaral-el-universo-sobre-mi|El universo sobre mí|Amaral|2005|https://www.youtube.com/watch?v=d5alBzLbDNw",
  "global-hit-es-amaral-dias-de-verano|Días de verano|Amaral|2005|https://www.youtube.com/watch?v=Iox1We01Om8",
  "global-hit-es-amaral-kamikaze|Kamikaze|Amaral|2008|https://www.youtube.com/watch?v=n1dYSJ9Kqm8",
  "global-hit-es-amaral-hacia-lo-salvaje|Hacia lo salvaje|Amaral|2011|https://www.youtube.com/watch?v=sdf152L-D3g",
  "global-hit-es-amaral-te-necesito|Te necesito|Amaral|2002|https://www.youtube.com/watch?v=l6Qz0127Mbw",
  "global-hit-es-rosalia-malamente|Malamente|Rosalía|2018|https://www.youtube.com/watch?v=Rht7rBHuXW8",
  "global-hit-es-rosalia-y-j-balvin-con-altura|Con altura|Rosalía y J Balvin|2019|https://www.youtube.com/watch?v=p7bfOZek9t4",
  "global-hit-es-rosalia-despecha|Despechá|Rosalía|2022|https://www.youtube.com/watch?v=5g2hT4GmAGU",
  "global-hit-es-rosalia-saoko|Saoko|Rosalía|2022|https://www.youtube.com/watch?v=6o7bCAZSxsg",
  "global-hit-es-rosalia-bizcochito|Bizcochito|Rosalía|2022|https://www.youtube.com/watch?v=aG5C32aATKc",
  "global-hit-es-rosalia-y-the-weeknd-la-fama|La fama|Rosalía y The Weeknd|2021|https://www.youtube.com/watch?v=e-CEd6xrRQc",
  "global-hit-es-rosalia-di-mi-nombre|Di mi nombre|Rosalía|2018|https://www.youtube.com/watch?v=fLmQbJ4SDTA",
  "global-hit-es-rosalia-tuya|Tuya|Rosalía|2023|https://www.youtube.com/watch?v=F84pjEryeC0",
  "global-hit-es-c-tangana-nino-de-elche-y-la-hungara-tu-me-dejaste-de-querer|Tú me dejaste de querer|C. Tangana, Niño de Elche y La Húngara|2020|https://www.youtube.com/watch?v=ltmO9XQVdSg",
  "global-hit-es-c-tangana-demasiadas-mujeres|Demasiadas mujeres|C. Tangana|2020|https://www.youtube.com/watch?v=ZlFri4ez_lE",
  "global-hit-es-c-tangana-y-gipsy-kings-ingobernable|Ingobernable|C. Tangana y Gipsy Kings|2021|https://www.youtube.com/watch?v=uV0r4a2QVkQ",
  "global-hit-es-c-tangana-y-nathy-peluso-ateo|Ateo|C. Tangana y Nathy Peluso|2021|https://www.youtube.com/watch?v=Y9WJOopLYBQ",
  "global-hit-es-c-tangana-y-rosalia-antes-de-morirme|Antes de morirme|C. Tangana y Rosalía|2016|https://www.youtube.com/watch?v=RxKVWs_qYBk",
  "global-hit-es-c-tangana-mala-mujer|Mala Mujer|C. Tangana|2017|https://www.youtube.com/watch?v=nsm4ReJaED0",
  "global-hit-es-c-tangana-nunca-estoy|Nunca estoy|C. Tangana|2020|https://www.youtube.com/watch?v=U6phuhL1YbY",
  "global-hit-es-c-tangana-y-toquinho-comerte-entera|Comerte entera|C. Tangana y Toquinho|2021|https://www.youtube.com/watch?v=3xlExHPyqM0",
  "global-hit-es-lola-indigo-ya-no-quiero-na|Ya no quiero ná|Lola Indigo|2018|https://www.youtube.com/watch?v=-dvftyeRYzM",
  "global-hit-es-lola-indigo-y-mala-rodriguez-mujer-bruja|Mujer bruja|Lola Indigo y Mala Rodríguez|2018|https://www.youtube.com/watch?v=a-geL8Q3U18",
  "global-hit-es-lola-indigo-danna-paola-y-denise-rosenthal-santeria|Santería|Lola Indigo, Danna Paola y Denise Rosenthal|2020|https://www.youtube.com/watch?v=IWCAOA-k168",
  "global-hit-es-lola-indigo-tini-y-belinda-la-nina-de-la-escuela|La niña de la escuela|Lola Indigo, Tini y Belinda|2021|https://www.youtube.com/watch?v=0jNg2lG2dQg",
  "global-hit-es-lola-indigo-toy-story|Toy Story|Lola Indigo|2022|https://www.youtube.com/watch?v=JTgzL9OkCpA",
  "global-hit-es-lola-indigo-y-maria-becerra-discoteka|Discoteka|Lola Indigo y María Becerra|2022|https://www.youtube.com/watch?v=hZSosx1btOU",
  "global-hit-es-bad-gyal-fiebre|Fiebre|Bad Gyal|2016|https://www.youtube.com/watch?v=tztPNljCfEY",
  "global-hit-es-omar-montes-y-bad-gyal-alocao|Alocao|Omar Montes y Bad Gyal|2019|https://www.youtube.com/watch?v=qha0QoVlm4g",
  "global-hit-es-bad-gyal-chulo|Chulo|Bad Gyal|2023|https://www.youtube.com/watch?v=tnbpWZNAT_Y",
  "global-hit-es-bad-gyal-flow-2000|Flow 2000|Bad Gyal|2021|https://www.youtube.com/watch?v=Y3XacUKTdHc",
  "global-hit-es-bad-gyal-nueva-york|Nueva York|Bad Gyal|2021|https://www.youtube.com/watch?v=FSFPF-FvcBs",
  "global-hit-es-bad-gyal-santa-maria|Santa María|Bad Gyal|2019|https://www.youtube.com/watch?v=wlJeZvdlx4E",
  "global-hit-es-ana-mena-y-rocco-hunt-a-un-paso-de-la-luna|A un paso de la luna|Ana Mena y Rocco Hunt|2020|https://www.youtube.com/watch?v=NQ3YKiMZDxw",
  "global-hit-es-ana-mena-y-belinda-las-12|Las 12|Ana Mena y Belinda|2022|https://www.youtube.com/watch?v=ZwZfcO3zhg0",
  "global-hit-es-ana-mena-madrid-city|Madrid City|Ana Mena|2023|https://www.youtube.com/watch?v=sh2lLZBnrfA",
  "global-hit-es-ana-mena-un-clasico|Un clásico|Ana Mena|2024|https://www.youtube.com/watch?v=o3L7U7hjkxo",
  "global-hit-es-abraham-mateo-y-ana-mena-quiero-decirte|Quiero decirte|Abraham Mateo y Ana Mena|2022|https://www.youtube.com/watch?v=QRvPuCoTMp0",
  "global-hit-es-chanel-y-abraham-mateo-clavaito|Clavaito|Chanel y Abraham Mateo|2023|https://www.youtube.com/watch?v=RW58hNjQ_Bw",
  "global-hit-es-abraham-mateo-maniaca|Maníaca|Abraham Mateo|2023|https://www.youtube.com/watch?v=MzBlHP2e8Ww",
  "global-hit-es-beret-lo-siento|Lo siento|Beret|2018|https://www.youtube.com/watch?v=li_smPIZOZs",
  "global-hit-es-beret-y-morat-porfa-no-te-vayas|Porfa no te vayas|Beret y Morat|2021|https://www.youtube.com/watch?v=zMvWTnVlYww",
  "global-hit-es-beret-si-por-mi-fuera|Si por mí fuera|Beret|2019|https://www.youtube.com/watch?v=1ZhsWvvw9p4",
  "global-hit-es-beret-te-echo-de-menos|Te echo de menos|Beret|2019|https://www.youtube.com/watch?v=e7Nzgv2RpPM",
  "global-hit-es-beret-ojala|Ojalá|Beret|2022|https://www.youtube.com/watch?v=C2DFsBvPS7c",
  "global-hit-es-pablo-alboran-solamente-tu|Solamente tú|Pablo Alborán|2010|https://www.youtube.com/watch?v=F0rwOsAteXM",
  "global-hit-es-pablo-alboran-prometo|Prometo|Pablo Alborán|2017|https://www.youtube.com/watch?v=cSUEFDZ3p3k",
  "global-hit-es-pablo-alboran-quien|Quién|Pablo Alborán|2012|https://www.youtube.com/watch?v=lvfyf7R8NVg",
  "global-hit-es-pablo-alboran-pasos-de-cero|Pasos de cero|Pablo Alborán|2014|https://www.youtube.com/watch?v=Dj1MRUkZu6s",
  "global-hit-es-pablo-lopez-y-juanes-tu-enemigo|Tu enemigo|Pablo López y Juanes|2015|https://www.youtube.com/watch?v=eS4Jas5DYdA",
  "global-hit-es-pablo-lopez-el-mundo|El mundo|Pablo López|2015|https://www.youtube.com/watch?v=lPNTbV7SBxk",
  "global-hit-es-pablo-lopez-vi|Vi|Pablo López|2013|https://www.youtube.com/watch?v=ZV57Sl8mQBo",
  "global-hit-es-pablo-lopez-lo-saben-mis-zapatos|Lo saben mis zapatos|Pablo López|2015|https://www.youtube.com/watch?v=HPqduBYgUu8",
  "global-hit-es-manuel-carrasco-que-bonito-es-querer|Qué bonito es querer|Manuel Carrasco|2018|https://www.youtube.com/watch?v=jqDEKHwpOJ0",
  "global-hit-es-manuel-carrasco-uno-x-uno|Uno x uno|Manuel Carrasco|2015|https://www.youtube.com/watch?v=FoaKwACo35I",
  "global-hit-es-manuel-carrasco-no-dejes-de-sonar|No dejes de soñar|Manuel Carrasco|2013|https://www.youtube.com/watch?v=xd0hgKMkMf8",
  "global-hit-es-manuel-carrasco-ya-no|Ya no|Manuel Carrasco|2016|https://www.youtube.com/watch?v=_KQPR8lgxsU",
  "global-hit-es-manuel-carrasco-me-dijeron-de-pequeno|Me dijeron de pequeño|Manuel Carrasco|2018|https://www.youtube.com/watch?v=GJRj9tu_m44",
  "global-hit-es-vanesa-martin-polvo-de-mariposas|Polvo de mariposas|Vanesa Martín|2014|https://www.youtube.com/watch?v=u2j6tAPfXQM",
  "global-hit-es-vanesa-martin-sin-saber-por-que|Sin saber por qué|Vanesa Martín|2009|https://www.youtube.com/watch?v=td8Xa8X1EkA",
  "global-hit-es-vanesa-martin-inventas|Inventas|Vanesa Martín|2014|https://www.youtube.com/watch?v=Tz5LXv0ygNA",
  "global-hit-es-vanesa-martin-te-has-perdido-quien-soy|Te has perdido quién soy|Vanesa Martín|2018|https://www.youtube.com/watch?v=PEWAxfDL2j4",
  "global-hit-es-rozalen-la-puerta-violeta|La puerta violeta|Rozalén|2017|https://www.youtube.com/watch?v=q4oDFPakVBg",
  "global-hit-es-rozalen-girasoles|Girasoles|Rozalén|2017|https://www.youtube.com/watch?v=iqHb7Wan98E",
  "global-hit-es-rozalen-comiendote-a-besos|Comiéndote a besos|Rozalén|2013|https://www.youtube.com/watch?v=LMRXovRghiM",
  "global-hit-es-david-bisbal-digale|Dígale|David Bisbal|2002|https://www.youtube.com/watch?v=tERt0LfoYCg",
  "global-hit-es-david-bisbal-silencio|Silencio|David Bisbal|2006|https://www.youtube.com/watch?v=FNtoUSxFY_w",
  "global-hit-es-david-bisbal-esclavo-de-sus-besos|Esclavo de sus besos|David Bisbal|2009|https://www.youtube.com/watch?v=Tn42lXoMKFA",
  "global-hit-es-david-bisbal-diez-mil-maneras|Diez mil maneras|David Bisbal|2014|https://www.youtube.com/watch?v=K8q5boZdKuU",
  "global-hit-es-melendi-caminando-por-la-vida|Caminando por la vida|Melendi|2005|https://www.youtube.com/watch?v=ivFX1_TSQFY",
  "global-hit-es-melendi-tu-jardin-con-enanitos|Tu jardín con enanitos|Melendi|2012|https://www.youtube.com/watch?v=v3-9eDFDAFw",
  "global-hit-es-melendi-lagrimas-desordenadas|Lágrimas desordenadas|Melendi|2012|https://www.youtube.com/watch?v=YbADVar8tjY",
  "global-hit-es-melendi-un-violinista-en-tu-tejado|Un violinista en tu tejado|Melendi|2008|https://www.youtube.com/watch?v=6EEYSbjkdlM",
  "global-hit-es-melendi-desde-que-estamos-juntos|Desde que estamos juntos|Melendi|2016|https://www.youtube.com/watch?v=0jgVoAdNioM",
  "global-hit-es-melendi-y-ha-ash-destino-o-casualidad|Destino o casualidad|Melendi y Ha*Ash|2017|https://www.youtube.com/watch?v=D9W4DLjmoOM",
  "global-hit-es-estopa-como-camaron|Como Camarón|Estopa|1999|https://www.youtube.com/watch?v=JmP89cIGJZM",
  "global-hit-es-estopa-vino-tinto|Vino tinto|Estopa|2001|https://www.youtube.com/watch?v=NOjgze5Nmzc",
  "global-hit-es-estopa-tu-calorro|Tu calorro|Estopa|1999|https://www.youtube.com/watch?v=uBFdSyDkPOU",
  "global-hit-es-estopa-cacho-a-cacho|Cacho a cacho|Estopa|1999|https://www.youtube.com/watch?v=USlpL-t98_8",
  "global-hit-es-estopa-pastillas-de-freno|Pastillas de freno|Estopa|2005|https://www.youtube.com/watch?v=pGabrt7Dy5g",
  "global-hit-es-estopa-fuente-de-energia|Fuente de energía|Estopa|2001|https://www.youtube.com/watch?v=EdtwwL-uI8g",
  "global-hit-es-la-oreja-de-van-gogh-rosas|Rosas|La Oreja de Van Gogh|2003|https://www.youtube.com/watch?v=nYnLVWXmRm8",
  "global-hit-es-la-oreja-de-van-gogh-la-playa|La playa|La Oreja de Van Gogh|2000|https://www.youtube.com/watch?v=cx5qVmtfayA",
  "global-hit-es-la-oreja-de-van-gogh-puedes-contar-conmigo|Puedes contar conmigo|La Oreja de Van Gogh|2003|https://www.youtube.com/watch?v=4MB0CmrADaU",
  "global-hit-es-la-oreja-de-van-gogh-jueves|Jueves|La Oreja de Van Gogh|2008|https://www.youtube.com/watch?v=4n8JJOD1h04",
  "global-hit-es-la-oreja-de-van-gogh-muneca-de-trapo|Muñeca de trapo|La Oreja de Van Gogh|2006|https://www.youtube.com/watch?v=d3et8s2z9wg",
  "global-hit-es-la-oreja-de-van-gogh-20-de-enero|20 de enero|La Oreja de Van Gogh|2003|https://www.youtube.com/watch?v=QmhcdlvUIUY",
  "global-hit-es-el-canto-del-loco-zapatillas|Zapatillas|El Canto del Loco|2005|https://www.youtube.com/watch?v=nHxam-MQg-o",
  "global-hit-es-el-canto-del-loco-la-madre-de-jose|La madre de José|El Canto del Loco|2003|https://www.youtube.com/watch?v=GBw8-_INgrU",
  "global-hit-es-el-canto-del-loco-besos|Besos|El Canto del Loco|2005|https://www.youtube.com/watch?v=wqwQ98wS4gw",
  "global-hit-es-el-canto-del-loco-volvera|Volverá|El Canto del Loco|2003|https://www.youtube.com/watch?v=uvEWuVrm1FU",
  "global-hit-es-dani-martin-cero|Cero|Dani Martín|2013|https://www.youtube.com/watch?v=A6Ef8wIakSk",
  "global-hit-es-dani-martin-16-anitos|16 añitos|Dani Martín|2010|https://www.youtube.com/watch?v=C9BTPLG2QEE",
  "global-hit-es-pereza-lady-madrid|Lady Madrid|Pereza|2009|https://www.youtube.com/watch?v=yR_9e1yo9uU",
  "global-hit-es-pereza-princesas|Princesas|Pereza|2005|https://www.youtube.com/watch?v=A9UdCLGvjXg",
  "global-hit-es-leiva-terriblemente-cruel|Terriblemente cruel|Leiva|2014|https://www.youtube.com/watch?v=5f5eiLOLIpg",
  "global-hit-es-leiva-como-si-fueras-a-morir-manana|Como si fueras a morir mañana|Leiva|2019|https://www.youtube.com/watch?v=DMSTr9JOhBE",
  "global-hit-es-fito-and-fitipaldis-por-la-boca-vive-el-pez|Por la boca vive el pez|Fito & Fitipaldis|2006|https://www.youtube.com/watch?v=iUXs4Nt3Y7Y",
  "global-hit-es-fito-and-fitipaldis-antes-de-que-cuente-diez|Antes de que cuente diez|Fito & Fitipaldis|2009|https://www.youtube.com/watch?v=275IksF2fQM",
  "global-hit-es-fito-and-fitipaldis-acabo-de-llegar|Acabo de llegar|Fito & Fitipaldis|2006|https://www.youtube.com/watch?v=WVvxcwp3v8Y",
  "global-hit-es-marea-corazon-de-mimbre|Corazón de mimbre|Marea|2001|https://www.youtube.com/watch?v=8A1fK85QQrw",
  "global-hit-es-extremoduro-la-vereda-de-la-puerta-de-atras|La vereda de la puerta de atrás|Extremoduro|2002|https://www.youtube.com/watch?v=rP9BB81NnZw",
  "global-hit-es-heroes-del-silencio-entre-dos-tierras|Entre dos tierras|Héroes del Silencio|1990|https://www.youtube.com/watch?v=SzimletXB7M",
  "global-hit-es-heroes-del-silencio-maldito-duende|Maldito duende|Héroes del Silencio|1990|https://www.youtube.com/watch?v=KUetD2MrwsA",
  "global-hit-es-heroes-del-silencio-la-chispa-adecuada|La chispa adecuada|Héroes del Silencio|1995|https://www.youtube.com/watch?v=sMNkDPFycNU",
  "global-hit-es-mecano-hijo-de-la-luna|Hijo de la luna|Mecano|1986|https://www.youtube.com/watch?v=OwGG5fX7bxY",
  "global-hit-es-mecano-mujer-contra-mujer|Mujer contra mujer|Mecano|1988|https://www.youtube.com/watch?v=wVSA2CEIQ7U",
  "global-hit-es-mecano-me-cuesta-tanto-olvidarte|Me cuesta tanto olvidarte|Mecano|1986|https://www.youtube.com/watch?v=7IguUFc7af4",
  "global-hit-es-hombres-g-devuelveme-a-mi-chica|Devuélveme a mi chica|Hombres G|1985|https://www.youtube.com/watch?v=QdJvjYsUCJM",
  "global-hit-es-hombres-g-venezia|Venezia|Hombres G|1985|https://www.youtube.com/watch?v=ZMDLKVkt718",
  "global-hit-es-hombres-g-te-quiero|Te quiero|Hombres G|1986|https://www.youtube.com/watch?v=bajIsfceMyA",
  "global-hit-es-alaska-y-dinarama-ni-tu-ni-nadie|Ni tú ni nadie|Alaska y Dinarama|1984|https://www.youtube.com/watch?v=sr6YQOh-tvg",
  "global-hit-es-la-casa-azul-la-fiesta-universal|La fiesta universal|La Casa Azul|2011|https://www.youtube.com/watch?v=W0Z5cqMAIZc",
] as const;

const GLOBAL_LATIN_HITS_PACK_ID = "global-latin-argentino-58-2026-08-15";

const GLOBAL_LATIN_HITS_PACK_ROWS = [
  "global-latin-malu-ciudad-de-papel|Ciudad de Papel|Malú|2018|https://www.youtube.com/watch?v=z5FSOiYgM6g",
  "global-latin-emilia-latin-girl|latin girl|Emilia|2025|https://www.youtube.com/watch?v=_MVge8K1nuc",
  "global-latin-milo-j-mai|M.A.I|Milo J|2024|https://www.youtube.com/watch?v=MldGX_mbS-o",
  "global-latin-taiu-milo-j-rara-vez|Rara Vez|Taiu y Milo J|2023|https://www.youtube.com/watch?v=aBSkvI0CkgU",
  "global-latin-bizarrap-milo-j-session-57|Milo J: Bzrp Music Sessions, Vol. 57|Bizarrap y Milo J|2023|https://www.youtube.com/watch?v=_6XzJPyAJDI",
  "global-latin-milo-j-milagrosa|Milagrosa|Milo J|2024|https://www.youtube.com/watch?v=9AEpbNi88F0",
  "global-latin-milo-j-bizarrap-fruto|Fruto|Milo J y Bizarrap|2023|https://www.youtube.com/watch?v=hiiUjI3ajbc",
  "global-latin-nicki-nicole-milo-j-dispara|DISPARA ***|Nicki Nicole y Milo J|2023|https://www.youtube.com/watch?v=XsSpBZXW538",
  "global-latin-emilia-jagger|Jagger.mp3|Emilia|2023|https://www.youtube.com/watch?v=0bgWUD8lakU",
  "global-latin-emilia-ludmilla-zecca-no-se-ve|No_se_ve.mp3|Emilia, Ludmilla y Zecca|2023|https://www.youtube.com/watch?v=fLzU21ltH4U",
  "global-latin-emilia-tini-la-original|La_Original.mp3|Emilia y TINI|2023|https://www.youtube.com/watch?v=rIcZ6X0jIl4",
  "global-latin-emilia-cuatro-veinte|cuatro veinte|Emilia|2022|https://www.youtube.com/watch?v=SG3dSWd5t6c",
  "global-latin-emilia-gta|GTA.mp3|Emilia|2023|https://www.youtube.com/watch?v=u61hJHutEFs",
  "global-latin-emilia-exclusive|Exclusive.mp3|Emilia|2023|https://www.youtube.com/watch?v=k-RoPmzJ0sw",
  "global-latin-big-one-emilia-callejero-fino-en-la-intimidad|En La Intimidad|Big One, Emilia y Callejero Fino|2023|https://www.youtube.com/watch?v=YgrwMV6DT5Y",
  "global-latin-emilia-duki-como-si-no-importara|Como Si No Importara|Emilia y Duki|2021|https://www.youtube.com/watch?v=00uPgn-8Nvg",
  "global-latin-bizarrap-shakira-session-53|Shakira: Bzrp Music Sessions, Vol. 53|Bizarrap y Shakira|2023|https://www.youtube.com/watch?v=CocEMWdc7Ck",
  "global-latin-bizarrap-nathy-peluso-session-36|Nathy Peluso: Bzrp Music Sessions, Vol. 36|Bizarrap y Nathy Peluso|2020|https://www.youtube.com/watch?v=0OkiUUU3Odw",
  "global-latin-bizarrap-residente-session-49|Residente: Bzrp Music Sessions, Vol. 49|Bizarrap y Residente|2022|https://www.youtube.com/watch?v=HO73gUhiYe0",
  "global-latin-bizarrap-villano-antillano-session-51|Villano Antillano: Bzrp Music Sessions, Vol. 51|Bizarrap y Villano Antillano|2022|https://www.youtube.com/watch?v=wvz97-lNPH8",
  "global-latin-bizarrap-peso-pluma-session-55|Peso Pluma: Bzrp Music Sessions, Vol. 55|Bizarrap y Peso Pluma|2023|https://www.youtube.com/watch?v=v5_SYkFpFiY",
  "global-latin-bizarrap-duki-session-50|Duki: Bzrp Music Sessions, Vol. 50|Bizarrap y Duki|2022|https://www.youtube.com/watch?v=Gzs60iBgd3E",
  "global-latin-bizarrap-tiago-pzk-session-48|Tiago PZK: Bzrp Music Sessions, Vol. 48|Bizarrap y Tiago PZK|2021|https://www.youtube.com/watch?v=h7U8TqOVyxc",
  "global-latin-bizarrap-nicky-jam-session-41|Nicky Jam: Bzrp Music Sessions, Vol. 41|Bizarrap y Nicky Jam|2021|https://www.youtube.com/watch?v=BH6T3CTuncc",
  "global-latin-bizarrap-lgante-session-38|L-Gante: Bzrp Music Sessions, Vol. 38|Bizarrap y L-Gante|2021|https://www.youtube.com/watch?v=z7rI82hyels",
  "global-latin-luck-ra-bm-la-morocha|La Morocha|Luck Ra y BM|2023|https://www.youtube.com/watch?v=mo7MpQZRd5Q",
  "global-latin-luck-ra-khea-hola-perdida|Hola Perdida|Luck Ra y Khea|2024|https://www.youtube.com/watch?v=CnuFA6PkOT8",
  "global-latin-luck-ra-abel-pintos-que-me-falte-todo|Que Me Falte Todo|Luck Ra y Abel Pintos|2024|https://www.youtube.com/watch?v=MAxuiSvA9hM",
  "global-latin-luck-ra-ya-no-vuelvas|Ya No Vuelvas|Luck Ra|2022|https://www.youtube.com/watch?v=QObKWMHZTLQ",
  "global-latin-luck-ra-te-mentiria|Te Mentiría|Luck Ra|2021|https://www.youtube.com/watch?v=hQZwXLn4Sqo",
  "global-latin-luck-ra-el-campeon|El Campeón|Luck Ra|2023|https://www.youtube.com/watch?v=d2YHRsK5P1k",
  "global-latin-tini-la-triple-t|La Triple T|TINI|2022|https://www.youtube.com/watch?v=SydGHrvcTZA",
  "global-latin-tini-cupido|Cupido|TINI|2023|https://www.youtube.com/watch?v=4k1fm6YNsg8",
  "global-latin-tini-maria-becerra-mienteme|Miénteme|TINI y Maria Becerra|2021|https://www.youtube.com/watch?v=mmRBXjVENDQ",
  "global-latin-maria-becerra-corazon-vacio|Corazón Vacío|Maria Becerra|2023|https://www.youtube.com/watch?v=bwleqLlAu-Y",
  "global-latin-maria-becerra-automatico|Automático|Maria Becerra|2022|https://www.youtube.com/watch?v=H0Gk2wGNtIk",
  "global-latin-maria-becerra-ojala|Ojalá|Maria Becerra|2022|https://www.youtube.com/watch?v=vOapgSfSN1s",
  "global-latin-nicki-nicole-wapo-traketero|Wapo Traketero|Nicki Nicole|2019|https://www.youtube.com/watch?v=0wLrPWueUJI",
  "global-latin-los-angeles-azules-nicki-nicole-otra-noche|Otra Noche|Los Ángeles Azules y Nicki Nicole|2021|https://www.youtube.com/watch?v=EOBE_uBSGYw",
  "global-latin-trueno-dance-crip|DANCE CRIP|Trueno|2021|https://www.youtube.com/watch?v=JWRlTezTF2k",
  "global-latin-trueno-nicki-nicole-bizarrap-mamichula|MAMICHULA|Trueno, Nicki Nicole y Bizarrap|2020|https://www.youtube.com/watch?v=NUteQQCMa_k",
  "global-latin-duki-khea-she-dont-give-a-fo|She Don't Give a FO|Duki ft. Khea|2017|https://www.youtube.com/watch?v=W0yp3rSfx3I",
  "global-latin-duki-rockstar|Rockstar|Duki|2018|https://www.youtube.com/watch?v=OWoMlr4bUQ4",
  "global-latin-duki-givenchy|GIVENCHY|Duki|2022|https://www.youtube.com/watch?v=ymvYySd_P2E",
  "global-latin-paulo-londra-adan-y-eva|Adan y Eva|Paulo Londra|2018|https://www.youtube.com/watch?v=aSjflT_J0Xo",
  "global-latin-paulo-londra-nena-maldicion|Nena Maldición|Paulo Londra ft. Lenny Tavárez|2018|https://www.youtube.com/watch?v=bX3S-_jUauc",
  "global-latin-wos-canguro|CANGURO|WOS|2019|https://www.youtube.com/watch?v=l5QAOvBqT3c",
  "global-latin-wos-arrancarmelo|ARRANCARMELO|WOS|2022|https://www.youtube.com/watch?v=RNLsc_DWDUw",
  "global-latin-lali-disciplina|Disciplina|Lali|2022|https://www.youtube.com/watch?v=84GLUqD3Qyc",
  "global-latin-lali-n5|N5|Lali|2022|https://www.youtube.com/watch?v=pHklWLaED60",
  "global-latin-nathy-peluso-mafiosa|MAFIOSA|Nathy Peluso|2021|https://www.youtube.com/watch?v=VE241132KKU",
  "global-latin-nathy-peluso-emergencia|EMERGENCIA|Nathy Peluso|2022|https://www.youtube.com/watch?v=_1z8gqtyUOQ",
  "global-latin-cazzu-lyanno-rauw-dalex-nada|Nada|Cazzu, Lyanno, Rauw Alejandro y Dalex|2019|https://www.youtube.com/watch?v=XTZHCzwTYS0",
  "global-latin-tiago-pzk-lit-maria-nicki-entre-nosotros-remix|Entre Nosotros Remix|Tiago PZK, LIT killah, Maria Becerra y Nicki Nicole|2021|https://www.youtube.com/watch?v=sidPTvbTv9o",
  "global-latin-lit-killah-apaga-el-celular|Apaga el Celular|LIT killah|2018|https://www.youtube.com/watch?v=OQviyPnOPvA",
  "global-latin-khea-bad-bunny-duki-cazzu-loca-remix|Loca Remix|Khea, Bad Bunny, Duki y Cazzu|2017|https://www.youtube.com/watch?v=oSDbm37N-l0",
  "global-latin-big-one-fmk-ke-personajes-un-finde|Un Finde|Ke Personajes, FMK y Big One|2023|https://www.youtube.com/watch?v=d2HmiKVoTNA",
  "global-latin-mesita-nicki-emilia-tiago-una-foto-remix|Una Foto Remix|Mesita, Nicki Nicole, Emilia y Tiago PZK|2024|https://www.youtube.com/watch?v=LWdAMW_4Yq0",
] as const;

const GLOBAL_CURRENT_POP_PACK_ID = "global-actuales-amaia-aitana-46-2026-08-15";

const GLOBAL_CURRENT_POP_PACK_ROWS = [
  "global-current-amaia-tengo-un-pensamiento|Tengo Un Pensamiento|Amaia|2024|https://www.youtube.com/watch?v=8RB9ePnlNRs",
  "global-current-amaia-tocoto|Tocotó|Amaia|2024|https://www.youtube.com/watch?v=jVTFnXy7w4A",
  "global-current-alizzz-amaia-el-encuentro|El encuentro|Alizzz y Amaia|2020|https://www.youtube.com/watch?v=sEjplW7a6jA",
  "global-current-aitana-superestrella|SUPERESTRELLA|Aitana|2025|https://www.youtube.com/watch?v=llZJ-9e4Yeo",
  "global-current-aitana-conexion-psiquica|CONEXIÓN PSÍQUICA|Aitana|2025|https://www.youtube.com/watch?v=TE4w05Bgnac",
  "global-current-aitana-6-de-febrero|6 DE FEBRERO|Aitana|2025|https://www.youtube.com/watch?v=7csX6CfgMoo",
  "global-current-quevedo-aitana-gran-via|GRAN VÍA|Quevedo ft. Aitana|2024|https://www.youtube.com/watch?v=WsmJ2P3fCkw",
  "global-current-zzoilo-aitana-mon-amour-remix|Mon Amour Remix|Zzoilo y Aitana|2021|https://www.youtube.com/watch?v=V3FAVbrc598",
  "global-current-aitana-cali-dandee-mas|+|Aitana, Cali Y El Dandee|2019|https://www.youtube.com/watch?v=pPoAE5DnQRg",
  "global-current-aitana-cuarto-azul|CUARTO AZUL|Aitana|2025|https://www.youtube.com/watch?v=LaBkz33VZl4",
  "global-current-aitana-segundo-intento|SEGUNDO INTENTO|Aitana|2025|https://www.youtube.com/watch?v=B4sV_5DDnT4",
  "global-current-aitana-myke-towers-sentimiento-natural|SENTIMIENTO NATURAL|Aitana y Myke Towers|2025|https://www.youtube.com/watch?v=A8zLfSetaCE",
  "global-current-aitana-en-el-centro-de-la-cama|EN EL CENTRO DE LA CAMA|Aitana|2025|https://www.youtube.com/watch?v=m9LdTgalo64",
  "global-current-aitana-de-1-beso-a-2-besos|DE 1 BESO A 2 BESOS|Aitana|2025|https://www.youtube.com/watch?v=d5NDlkHVWk4",
  "global-current-aitana-danny-ocean-hoy-es-tu-cumpleanos|HOY ES TU CUMPLEAÑOS|Aitana y Danny Ocean|2025|https://www.youtube.com/watch?v=kvKCtR9Q1vw",
  "global-current-aitana-fangoria-la-chica-perfecta|LA CHICA PERFECTA|Aitana y Fangoria|2025|https://www.youtube.com/watch?v=59FCMoaDVh8",
  "global-current-aitana-musica-en-el-cielo|MÚSICA EN EL CIELO|Aitana|2025|https://www.youtube.com/watch?v=wTumpKostSs",
  "global-current-aitana-cuando-hables-con-el|CUANDO HABLES CON ÉL|Aitana|2025|https://www.youtube.com/watch?v=yxGhRK2Hth4",
  "global-current-aitana-jay-wheeler-duele-un-monton-despedirme-de-ti|DUELE UN MONTÓN DESPEDIRME DE TI|Aitana y Jay Wheeler|2025|https://www.youtube.com/watch?v=dBHm8wSPuJ0",
  "global-current-aitana-desde-que-ya-no-hablamos|DESDE QUE YA NO HABLAMOS|Aitana|2025|https://www.youtube.com/watch?v=9URfb4AGI5w",
  "global-current-aitana-kenia-os-ex-ex-ex|EX EX EX|Aitana y Kenia OS|2025|https://www.youtube.com/watch?v=FWvMbRYjYfE",
  "global-current-aitana-lia|LIA|Aitana|2025|https://www.youtube.com/watch?v=KAGwQD62g-I",
  "global-current-sabrina-carpenter-espresso|Espresso|Sabrina Carpenter|2024|https://www.youtube.com/watch?v=eVli-tstM5E",
  "global-current-sabrina-carpenter-please-please-please|Please Please Please|Sabrina Carpenter|2024|https://www.youtube.com/watch?v=cF1Na4AIecM",
  "global-current-chappell-roan-good-luck-babe|Good Luck, Babe!|Chappell Roan|2024|https://www.youtube.com/watch?v=U_Lz_MG35hM",
  "global-current-chappell-roan-pink-pony-club|Pink Pony Club|Chappell Roan|2020|https://www.youtube.com/watch?v=GR3Liudev18",
  "global-current-benson-boone-beautiful-things|Beautiful Things|Benson Boone|2024|https://www.youtube.com/watch?v=Oa_RSwwpPaA",
  "global-current-teddy-swims-lose-control|Lose Control|Teddy Swims|2023|https://www.youtube.com/watch?v=9gWIIIr2Asw",
  "global-current-myles-smith-stargazing|Stargazing|Myles Smith|2024|https://www.youtube.com/watch?v=9p9EauIOPm8",
  "global-current-hozier-too-sweet|Too Sweet|Hozier|2024|https://www.youtube.com/watch?v=NTpbbQUBbuo",
  "global-current-billie-eilish-birds-of-a-feather|BIRDS OF A FEATHER|Billie Eilish|2024|https://www.youtube.com/watch?v=V9PVRfjEBTI",
  "global-current-lady-gaga-bruno-mars-die-with-a-smile|Die With A Smile|Lady Gaga y Bruno Mars|2024|https://www.youtube.com/watch?v=kPa7bsKwL-c",
  "global-current-taylor-swift-cruel-summer|Cruel Summer|Taylor Swift|2019|https://www.youtube.com/watch?v=GrKQvyXpNgc",
  "global-current-tate-mcrae-greedy|greedy|Tate McRae|2023|https://www.youtube.com/watch?v=To4SWGZkEPk",
  "global-current-olivia-rodrigo-vampire|vampire|Olivia Rodrigo|2023|https://www.youtube.com/watch?v=RlPNh_PBZb4",
  "global-current-olivia-rodrigo-drivers-license|drivers license|Olivia Rodrigo|2021|https://www.youtube.com/watch?v=ZmDBbnmKpqQ",
  "global-current-raye-070-shake-escapism|Escapism.|RAYE y 070 Shake|2022|https://www.youtube.com/watch?v=Dll6VJ2C7wo",
  "global-current-pinkpantheress-ice-spice-boys-a-liar|Boy's a liar Pt. 2|PinkPantheress y Ice Spice|2023|https://www.youtube.com/watch?v=oftolPu9qp4",
  "global-current-sza-kill-bill|Kill Bill|SZA|2022|https://www.youtube.com/watch?v=MSRcC626prw",
  "global-current-miley-cyrus-end-of-the-world|End of the World|Miley Cyrus|2025|https://www.youtube.com/watch?v=CXBFU97X61I",
  "global-current-dua-lipa-houdini|Houdini|Dua Lipa|2023|https://www.youtube.com/watch?v=suAR1PYFNYA",
  "global-current-dua-lipa-training-season|Training Season|Dua Lipa|2024|https://www.youtube.com/watch?v=ZjBZ8MUnB0E",
  "global-current-karol-g-si-antes-te-hubiera-conocido|Si Antes Te Hubiera Conocido|KAROL G|2024|https://www.youtube.com/watch?v=MgsdDfdGdHc",
  "global-current-bad-bunny-nuevayol|NUEVAYoL|Bad Bunny|2025|https://www.youtube.com/watch?v=KU5V5WZVcVE",
  "global-current-feid-atl-jacob-luna|LUNA|Feid y ATL Jacob|2023|https://www.youtube.com/watch?v=x2oUajHp8pg",
  "global-current-floyymenor-cris-mj-gata-only|Gata Only|FloyyMenor y Cris MJ|2024|https://www.youtube.com/watch?v=-r687V8yqKY",
] as const;

const GLOBAL_2025_2026_LATIN_PACK_ID =
  "global-latino-actual-2025-2026-68";

const GLOBAL_2025_2026_LATIN_PACK_ROWS = [
  "global-2026-ana-mena-lola-indigo-pa-ti-toa|pa ti toa <3|Ana Mena y Lola Indigo|2026|https://www.youtube.com/watch?v=52cnhvRR6h4",
  "global-2026-quevedo-elvis-crespo-la-graciosa|LA GRACIOSA|Quevedo ft. Elvis Crespo|2026|https://www.youtube.com/watch?v=LZPLBSRnxSY",
  "global-2026-quevedo-nueva-linea-al-golpito|AL GOLPITO|Quevedo ft. Nueva Línea|2026|https://www.youtube.com/watch?v=-jm7ZjTqNz0",
  "global-2026-quevedo-ni-borracho|NI BORRACHO|Quevedo|2026|https://www.youtube.com/watch?v=Cp2nGBXIkfE",
  "global-2026-quevedo-el-baifo|EL BAIFO|Quevedo|2026|https://www.youtube.com/watch?v=l2ahLMi0qSY",
  "global-2026-quevedo-scandic|SCANDIC|Quevedo|2026|https://www.youtube.com/watch?v=9Ivrmo3JZMc",
  "global-2026-quevedo-caprichoso|CAPRICHOSO|Quevedo|2026|https://www.youtube.com/watch?v=0_AO2vmNVng",
  "global-2026-quevedo-hookah-y-calor|HOOKAH Y CALOR|Quevedo|2026|https://www.youtube.com/watch?v=daKCard2fuU",
  "global-2026-quevedo-tonny-tun-tun-galdar|GÁLDAR|Quevedo y Tonny Tun Tun|2026|https://www.youtube.com/watch?v=7cHRcVDPnR0",
  "global-2025-myke-towers-quevedo-soleao|SOLEAO|Myke Towers y Quevedo|2025|https://www.youtube.com/watch?v=JgqsAvvwZAQ",
  "global-2025-ovy-quevedo-beele-yo-y-tu|YO y TÚ|Ovy On The Drums, Quevedo y Beéle|2025|https://www.youtube.com/watch?v=WN46hLQkFq0",
  "global-2026-quevedo-la-pantera-lucho-rk-juseph-algo-va-a-pasar|ALGO VA A PASAR|Quevedo, La Pantera, Lucho RK y Juseph|2026|https://www.youtube.com/watch?v=knGfe_UujWE",
  "global-2026-shakira-burna-boy-dai-dai|Dai Dai|Shakira y Burna Boy|2026|https://www.youtube.com/watch?v=fcnDmrtj6Sk",
  "global-2026-jay-wheeler-omar-courtz-de-lejitos-remix|De Lejitos - Remix|Jay Wheeler y Omar Courtz|2026|https://www.youtube.com/watch?v=xCkf2L7gFnI",
  "global-2026-ya-ice-dilan-rey-tony-dichavate|Dichavate|Ya Ice Dilan, Rey Tony, Helabusador, JipMusic Global y Dj Honda|2026|https://www.youtube.com/watch?v=I_46tPHvVOw",
  "global-2026-conep-after|After|Conep|2026|https://www.youtube.com/watch?v=6dfNMwl6sSM",
  "global-2026-mvrk-daale|DAALE|mvrk|2026|https://www.youtube.com/watch?v=dCsOKHKHkmI",
  "global-2026-young-miko-clarent-bnb|BnB|Young Miko y Clarent|2026|https://www.youtube.com/watch?v=ZQW96Jf12Z8",
  "global-2025-romeo-santos-prince-royce-dardos|Dardos|Romeo Santos y Prince Royce|2025|https://www.youtube.com/watch?v=7KrNh9YaeDg",
  "global-2026-omar-courtz-koko|KOKO|Omar Courtz|2026|https://www.youtube.com/watch?v=slmRkI1xAqk",
  "global-2025-w-sound-beele-ovy-la-plena|La Plena - W Sound 05|W Sound, Beéle y Ovy On The Drums|2025|https://www.youtube.com/watch?v=wC_sOpQjvWE",
  "global-2026-aissa-rvfv-kreamly-muchacha|MUCHACHA|Aissa, Rvfv y Kreamly|2026|https://www.youtube.com/watch?v=Ma-BXYXX-nU",
  "global-2025-rels-b-tu-vas-sin|TU VAS SIN (fav)|Rels B|2025|https://www.youtube.com/watch?v=LypslWGSvSI",
  "global-2025-alleh-yorghaki-capaz-merengueton|capaz (merengueton)|Alleh y Yorghaki|2025|https://www.youtube.com/watch?v=cMhT1SqxqHY",
  "global-2025-bad-bunny-baile-inolvidable|BAILE INoLVIDABLE|Bad Bunny|2025|https://www.youtube.com/watch?v=a1Femq4NPxs",
  "global-2026-lola-indigo-lucho-rk-el-bachaton-de-la-l|EL BACHATÓN DE LA L|Lola Indigo y Lucho RK|2026|https://www.youtube.com/watch?v=20UtEjuTciQ",
  "global-2026-la-la-love-you-axolotes-el-fin-del-mundo|El Fin del Mundo|La La Love You y Axolotes Mexicanos|2019|https://www.youtube.com/watch?v=6cF6b6pLijE",
  "global-2026-ryan-castro-kapo-gangsta-la-villa|LA VILLA|Ryan Castro, Kapo y Gangsta|2026|https://www.youtube.com/watch?v=EochZ-iyrqQ",
  "global-2026-jay-wheeler-fuga|Fuga|Jay Wheeler|2026|https://www.youtube.com/watch?v=8jiN7pQOpHw",
  "global-2025-mora-c-tangana-droga|DROGA|Mora y C. Tangana|2025|https://www.youtube.com/watch?v=ssVCtZBQyus",
  "global-2026-omar-courtz-roa-wo-oh-oh|WO OH OH|Omar Courtz y ROA|2026|https://www.youtube.com/watch?v=nONFnjR5VFI",
  "global-2026-yapi-soundplug-por-ti|POR TI|Yapi y SOUNDPLUG|2026|https://www.youtube.com/watch?v=oLGRb9TH87U",
  "global-2026-omar-courtz-nengo-flow-forevel-tu-gantel|FOREVEL TU GANTEL|Omar Courtz y Ñengo Flow|2026|https://www.youtube.com/watch?v=AhdNGNlT0GE",
  "global-2026-anmi-la-pantera-kabasaki-no-me-guillo-v2|NO ME GUILLO v2|ANMI, La Pantera y Kabasaki|2026|https://www.youtube.com/watch?v=vVMsU3VQAJ0",
  "global-2026-young-cister-kreamly-qloo|QLOO*|Young Cister y Kreamly|2026|https://www.youtube.com/watch?v=u6Fkx2I2ksI",
  "global-2026-los-buyer-pikeras-no-le-digo-que-no|NO LE DIGO QUE NO|Los Buyer y Pikeras|2026|https://www.youtube.com/watch?v=rQ-XrALZiRM",
  "global-2026-lucho-rk-aire|AIRE|Lucho RK|2026|https://www.youtube.com/watch?v=oW1AhnZM-t0",
  "global-2026-rvfv-corrupta|Corrupta|Rvfv|2026|https://www.youtube.com/watch?v=wDFXtkEUPKw",
  "global-2026-quevedo-tuchat|TUCHAT|Quevedo|2026|https://www.youtube.com/watch?v=mtep_hqXltU",
  "global-2026-jc-reyes-morad-quevedo-desde-0|DESDE 0|JC Reyes, Morad y Quevedo|2026|https://www.youtube.com/watch?v=41PvnH19RHY",
  "global-2026-juseph-quevedo-chuos|CHUOS|Juseph y Quevedo|2026|https://www.youtube.com/watch?v=eS4AEloW5kY",
  "global-2025-lola-indigo-maria-becerra-villano-la-reina-remix|LA REINA (REMIX)|Lola Indigo, Maria Becerra y Villano Antillano|2025|https://www.youtube.com/watch?v=HGvUZh3JAoM",
  "global-2025-lola-indigo-sin-autotune|SIN AUTOTUNE|Lola Indigo|2025|https://www.youtube.com/watch?v=SHOYtsAvux4",
  "global-2025-lola-indigo-moja1ta|MOJA1TA|Lola Indigo|2025|https://www.youtube.com/watch?v=ks2_mOrIl7c",
  "global-2025-ana-mena-largate|Lárgate|Ana Mena|2025|https://www.youtube.com/watch?v=qMC-IVM-IdA",
  "global-2025-ana-mena-dargen-cinema-spento|Cinema spento|Ana Mena ft. Dargen D'Amico|2025|https://www.youtube.com/watch?v=vQ7pGTCnYpE",
  "global-2026-villano-antillano-bichifokel|BICHIFOKEL|Villano Antillano|2026|https://www.youtube.com/watch?v=lljI1zBCtWs",
  "global-2025-villano-antillano-pichersita|Pichersita|Villano Antillano|2025|https://www.youtube.com/watch?v=25F0u4oPhSU",
  "global-2025-pabllo-vittar-villano-antillano-rockstar|ROCKSTAR|Pabllo Vittar y Villano Antillano|2025|https://www.youtube.com/watch?v=FfPVo-8zGiE",
  "global-2025-juicy-bae-villano-antillano-idgaf|IDGaF|Juicy BAE y Villano Antillano|2025|https://www.youtube.com/watch?v=So8MpaeUjeQ",
  "global-2025-samantha-hudson-villano-full-lace-y-el-tuck|Full Lace y el Tuck|Samantha Hudson y Villano Antillano|2025|https://www.youtube.com/watch?v=1OWNJ1gbnNg",
  "global-2025-villano-antillano-xxl|XXL|Villano Antillano|2025|https://www.youtube.com/watch?v=79mfRCXq2Vk",
  "global-2025-mima-villano-antillano-fuego|Fuego|MIMA y Villano Antillano|2025|https://www.youtube.com/watch?v=XD039sOJBKA",
  "global-2025-emilia-tini-nicki-blackout|blackout|Emilia, TINI y Nicki Nicole|2025|https://www.youtube.com/watch?v=WMfOaOSz0R4",
  "global-2025-maria-becerra-tini-xross-hasta-que-me-enamoro|HASTA QUE ME ENAMORO|Maria Becerra, TINI y XROSS|2025|https://www.youtube.com/watch?v=3BVHzsglnto",
  "global-2025-beele-no-tiene-sentido|no tiene sentido|Beéle|2025|https://www.youtube.com/watch?v=HL9VoQ-er_U",
  "global-2025-beele-ovy-mi-refe|mi refe|Beéle y Ovy On The Drums|2025|https://www.youtube.com/watch?v=w8l33K5D5CI",
  "global-2025-nicky-jam-beele-hiekka|Hiekka|Nicky Jam y Beéle|2025|https://www.youtube.com/watch?v=0B1ujEFubrE",
  "global-2025-manuel-turizo-kapo-que-pecao|Qué Pecao|Manuel Turizo y Kapo|2025|https://www.youtube.com/watch?v=NF3SXFnrumE",
  "global-2025-depol-te-confieso|Te Confieso|DePol|2025|https://www.youtube.com/watch?v=b392d4HjG20",
  "global-2025-dani-fernandez-valeria-y-si-lo-hacemos|¿Y si lo hacemos?|Dani Fernández y Valeria Castro|2025|https://www.youtube.com/watch?v=KytEwsCgWKw",
  "global-2025-rosalia-dios-es-un-stalker|Dios Es Un Stalker|ROSALÍA|2025|https://www.youtube.com/watch?v=fLmQbJ4SDTA",
  "global-2025-rosalia-la-perla|La Perla|ROSALÍA ft. Yahritza Y Su Esencia|2025|https://www.youtube.com/watch?v=GkTWxDB21cA",
  "global-2025-bad-bunny-dtmf|DtMF|Bad Bunny|2025|https://www.youtube.com/watch?v=BbCOpS0nCDA",
  "global-2025-bad-bunny-eoo|EoO|Bad Bunny|2025|https://www.youtube.com/watch?v=YY2z-m2Bh64",
  "global-2025-bad-bunny-voy-a-llevarte-pa-pr|VOY A LLeVARTE PA PR|Bad Bunny|2025|https://www.youtube.com/watch?v=kQHLx7Awnrc",
  "global-2025-bad-bunny-chuwi-weltita|WELTiTA|Bad Bunny ft. Chuwi|2025|https://www.youtube.com/watch?v=vmbyVU9w47Y",
  "global-2025-bad-bunny-ketu-tecre|KETU TeCRÉ|Bad Bunny|2025|https://www.youtube.com/watch?v=aoXDGMZhdJk",
] as const;

const GLOBAL_MASSIVE_POP_PACK_ID = "global-massive-pop-350-2026-08-15";

const GLOBAL_MASSIVE_POP_PACK_ROWS = [
  "global-massive-2010-malu-blanco-y-negro|Blanco y Negro|Malú|2010|https://www.youtube.com/watch?v=cbYp1ZB5cGg",
  "global-massive-1998-malu-aprendiz|Aprendiz|Malú|1998|https://www.youtube.com/watch?v=jdnYH-kGzP4",
  "global-massive-2001-malu-toda|Toda|Malú|2001|https://www.youtube.com/watch?v=ngyP34TB3jA",
  "global-massive-2001-malu-diles|Diles|Malú|2001|https://www.youtube.com/watch?v=JmBswF6yE-w",
  "global-massive-2013-malu-a-prueba-de-ti|A prueba de ti|Malú|2013|https://www.youtube.com/watch?v=Bd_YlSj5H98",
  "global-massive-2010-malu-deshazte-de-mi|Deshazte de mí|Malú|2010|https://www.youtube.com/watch?v=ugxR6TElTRE",
  "global-massive-2017-malu-invisible|Invisible|Malú|2017|https://www.youtube.com/watch?v=Q9HQGxWZThc",
  "global-massive-2006-malu-no-voy-a-cambiar|No voy a cambiar|Malú|2006|https://www.youtube.com/watch?v=jFEKB2uVXrE",
  "global-massive-2020-malu-tejiendo-alas|Tejiendo alas|Malú|2020|https://www.youtube.com/watch?v=WTsXNQUyWWg",
  "global-massive-2015-malu-cenizas|Cenizas|Malú|2015|https://www.youtube.com/watch?v=16l-cFqHjjw",
  "global-massive-2016-shakira-ft-maluma-chantaje|Chantaje|Shakira ft. Maluma|2016|https://www.youtube.com/watch?v=6Mgqbai3fKo",
  "global-massive-2022-shakira-y-ozuna-monotonia|Monotonía|Shakira y Ozuna|2022|https://www.youtube.com/watch?v=j5y6xLpRwx4",
  "global-massive-2022-shakira-y-rauw-alejandro-te-felicito|Te Felicito|Shakira y Rauw Alejandro|2022|https://www.youtube.com/watch?v=4I25nV9hXGA",
  "global-massive-2010-shakira-ft-el-cata-loca|Loca|Shakira ft. El Cata|2010|https://www.youtube.com/watch?v=XAhTt60W7qo",
  "global-massive-2009-shakira-she-wolf|She Wolf|Shakira|2009|https://www.youtube.com/watch?v=booKP974B0k",
  "global-massive-2001-shakira-whenever-wherever|Whenever Wherever|Shakira|2001|https://www.youtube.com/watch?v=weRHyjj34ZE",
  "global-massive-1998-shakira-ciega-sordomuda|Ciega sordomuda|Shakira|1998|https://www.youtube.com/watch?v=B3gbisdtJnA",
  "global-massive-2005-shakira-ft-gustavo-cerati-no|No|Shakira ft. Gustavo Cerati|2005|https://www.youtube.com/watch?v=WhoPPnDiY5c",
  "global-massive-2005-shakira-dia-de-enero|Día de Enero|Shakira|2005|https://www.youtube.com/watch?v=BPidLpADlaM",
  "global-massive-2010-shakira-ft-el-cata-rabiosa|Rabiosa|Shakira ft. El Cata|2010|https://www.youtube.com/watch?v=8OO1pOqRJkA",
  "global-massive-2014-shakira-ft-rihanna-can-t-remember-to-forget-you|Can't Remember to Forget You|Shakira ft. Rihanna|2014|https://www.youtube.com/watch?v=o3mP3mJDL2k",
  "global-massive-2014-shakira-empire|Empire|Shakira|2014|https://www.youtube.com/watch?v=QapfTGTXbxc",
  "global-massive-2023-shakira-acrostico|Acróstico|Shakira|2023|https://www.youtube.com/watch?v=PWmJhh_qTSY",
  "global-massive-2024-shakira-ft-cardi-b-punteria|Puntería|Shakira ft. Cardi B|2024|https://www.youtube.com/watch?v=SHnDwYgGKkY",
  "global-massive-2023-bizarrap-y-shakira-shakira-bzrp-music-sessions-vol-53|Shakira BZRP Music Sessions Vol. 53|Bizarrap y Shakira|2023|https://www.youtube.com/watch?v=_mPp7M7PxBg",
  "global-massive-2008-carlos-baute-y-marta-sanchez-colgando-en-tus-manos|Colgando en tus manos|Carlos Baute y Marta Sánchez|2008|https://www.youtube.com/watch?v=qExd-3oCTl4",
  "global-massive-2019-suu-tant-de-bo|Tant de bo|Suu|2019|https://www.youtube.com/watch?v=x3a3MYOXDaQ",
  "global-massive-2020-suu-eres-un-temazo|Eres un temazo|Suu|2020|https://www.youtube.com/watch?v=sHI704kio20",
  "global-massive-2020-suu-nota-de-voz|Nota de voz|Suu|2020|https://www.youtube.com/watch?v=Jvfi5xvbocI",
  "global-massive-2018-marshmello-y-anne-marie-friends|FRIENDS|Marshmello y Anne-Marie|2018|https://www.youtube.com/watch?v=jzD_yyEcp0M",
  "global-massive-2018-marshmello-y-bastille-happier|Happier|Marshmello y Bastille|2018|https://www.youtube.com/watch?v=m7Bc3pLyij0",
  "global-massive-2017-marshmello-ft-khalid-silence|Silence|Marshmello ft. Khalid|2017|https://www.youtube.com/watch?v=Tx1sqYc3qas",
  "global-massive-2016-marshmello-alone|Alone|Marshmello|2016|https://www.youtube.com/watch?v=ALZHF5UqnU4",
  "global-massive-2017-selena-gomez-y-marshmello-wolves|Wolves|Selena Gomez y Marshmello|2017|https://www.youtube.com/watch?v=cH4E_t3m3xM",
  "global-massive-2015-shawn-mendes-stitches|Stitches|Shawn Mendes|2015|https://www.youtube.com/watch?v=VbfpW0pbvaU",
  "global-massive-2017-shawn-mendes-there-s-nothing-holdin-me-back|There's Nothing Holdin' Me Back|Shawn Mendes|2017|https://www.youtube.com/watch?v=dT2owtxkU8k",
  "global-massive-2019-shawn-mendes-y-camila-cabello-senorita|Señorita|Shawn Mendes y Camila Cabello|2019|https://www.youtube.com/watch?v=Pkh8UtuejGw",
  "global-massive-2016-shawn-mendes-mercy|Mercy|Shawn Mendes|2016|https://www.youtube.com/watch?v=KkGVmN68ByU",
  "global-massive-2018-shawn-mendes-in-my-blood|In My Blood|Shawn Mendes|2018|https://www.youtube.com/watch?v=36tggrpRoTI",
  "global-massive-2019-shawn-mendes-if-i-can-t-have-you|If I Can't Have You|Shawn Mendes|2019|https://www.youtube.com/watch?v=oTJ-oqwxdZY",
  "global-massive-2020-shawn-mendes-wonder|Wonder|Shawn Mendes|2020|https://www.youtube.com/watch?v=fHeQemJJQII",
  "global-massive-2018-shawn-mendes-lost-in-japan|Lost In Japan|Shawn Mendes|2018|https://www.youtube.com/watch?v=SAWzXkV3hHo",
  "global-massive-2021-c-tangana-ft-gipsy-kings-ingobernable|Ingobernable|C. Tangana ft. Gipsy Kings|2021|https://www.youtube.com/watch?v=UzcPKP3KipQ",
  "global-massive-2018-c-tangana-y-nino-de-elche-un-veneno|Un Veneno|C. Tangana y Niño de Elche|2018|https://www.youtube.com/watch?v=h0Tb9VtVzVE",
  "global-massive-2019-c-tangana-y-alizzz-para-repartir|Para Repartir|C. Tangana y Alizzz|2019|https://www.youtube.com/watch?v=yCISQU4JEqA",
  "global-massive-2021-c-tangana-ft-toquinho-comerte-entera|Comerte Entera|C. Tangana ft. Toquinho|2021|https://www.youtube.com/watch?v=8z3z-ryzYdo",
  "global-massive-2021-c-tangana-y-andres-calamaro-hong-kong|Hong Kong|C. Tangana y Andrés Calamaro|2021|https://www.youtube.com/watch?v=XLLkSBLqlvQ",
  "global-massive-2021-c-tangana-y-kiko-veneno-los-tontos|Los Tontos|C. Tangana y Kiko Veneno|2021|https://www.youtube.com/watch?v=vjWyRfnR5CQ",
  "global-massive-2016-coldplay-hymn-for-the-weekend|Hymn for the Weekend|Coldplay|2016|https://www.youtube.com/watch?v=YykjpeuMNEk",
  "global-massive-2014-coldplay-a-sky-full-of-stars|A Sky Full of Stars|Coldplay|2014|https://www.youtube.com/watch?v=VPRjCeoBqrI",
  "global-massive-2002-coldplay-the-scientist|The Scientist|Coldplay|2002|https://www.youtube.com/watch?v=RB-RcX5DS5A",
  "global-massive-2021-coldplay-y-bts-my-universe|My Universe|Coldplay y BTS|2021|https://www.youtube.com/watch?v=3YqPKLZF_WU",
  "global-massive-2021-ptazeta-mami|Mami|Ptazeta|2021|https://www.youtube.com/watch?v=HMF2DPqWN5M",
  "global-massive-2020-ptazeta-ri-ri|Ri Ri|Ptazeta|2020|https://www.youtube.com/watch?v=Ghd1RRBizOs",
  "global-massive-2022-ptazeta-ponte-pal-xxx|Ponte Pal XXX|Ptazeta|2022|https://www.youtube.com/watch?v=fKzaU15y0ZE",
  "global-massive-2023-ptazeta-tiki-tiki|Tiki Tiki|Ptazeta|2023|https://www.youtube.com/watch?v=gYCJUopdCKY",
  "global-massive-2019-delaossa-la-placita|La Placita|Delaossa|2019|https://www.youtube.com/watch?v=NresVOVXoOU",
  "global-massive-2020-delaossa-me-has-dejado|Me Has Dejado|Delaossa|2020|https://www.youtube.com/watch?v=i73MhnfB7zc",
  "global-massive-2021-delaossa-veneno|Veneno|Delaossa|2021|https://www.youtube.com/watch?v=Bhssa61lRjs",
  "global-massive-2019-delaossa-ojos-verdes|Ojos Verdes|Delaossa|2019|https://www.youtube.com/watch?v=sVcG4g_rEmg",
  "global-massive-2021-delaossa-si-me-quieres-escribir|Si Me Quieres Escribir|Delaossa|2021|https://www.youtube.com/watch?v=OXP2N2HAkbA",
  "global-massive-2019-don-patricio-enchochado-de-ti|Enchochado de Ti|Don Patricio|2019|https://www.youtube.com/watch?v=Ge-RIoB4uqY",
  "global-massive-2019-don-patricio-lola-bunny|Lola Bunny|Don Patricio|2019|https://www.youtube.com/watch?v=wUS1xWcssEc",
  "global-massive-2020-don-patricio-carita-de-guino|Carita de Guiño|Don Patricio|2020|https://www.youtube.com/watch?v=x5V7G5Zb4F8",
  "global-massive-2021-marmi-y-aitana-tu-foto-del-dni|Tu Foto Del DNI|Marmi y Aitana|2021|https://www.youtube.com/watch?v=A_UZ41FPhj8",
  "global-massive-2017-pablo-lopez-el-patio|El Patio|Pablo López|2017|https://www.youtube.com/watch?v=7aQaYt-1e2A",
  "global-massive-2017-pablo-lopez-hijos-del-verbo-amar|Hijos Del Verbo Amar|Pablo López|2017|https://www.youtube.com/watch?v=Xre1ME1Uazs",
  "global-massive-2017-pablo-lopez-la-mejor-noche-de-mi-vida|La Mejor Noche De Mi Vida|Pablo López|2017|https://www.youtube.com/watch?v=-4qCQ_Abozw",
  "global-massive-2017-rozalen-y-estopa-vivir|Vivir|Rozalén y Estopa|2017|https://www.youtube.com/watch?v=OlljAWwbiLI",
  "global-massive-2015-rozalen-80-veces|80 Veces|Rozalén|2015|https://www.youtube.com/watch?v=iEsBFdQXx2A",
  "global-massive-2020-rozalen-este-tren|Este Tren|Rozalén|2020|https://www.youtube.com/watch?v=k_J3Q27cq0Y",
  "global-massive-2021-morat-y-beret-porfa-no-te-vayas|Porfa No Te Vayas|Morat y Beret|2021|https://www.youtube.com/watch?v=Vm-SE_9_hi0",
  "global-massive-2022-morat-y-feid-salir-con-vida|Salir Con Vida|Morat y Feid|2022|https://www.youtube.com/watch?v=9a5MbvxzKgs",
  "global-massive-2018-alec-benjamin-let-me-down-slowly|Let Me Down Slowly|Alec Benjamin|2018|https://www.youtube.com/watch?v=50VNCymT-Cs",
  "global-massive-2022-alec-benjamin-devil-doesn-t-bargain|Devil Doesn't Bargain|Alec Benjamin|2022|https://www.youtube.com/watch?v=6zNHZkT3DXk",
  "global-massive-2018-alec-benjamin-water-fountain|Water Fountain|Alec Benjamin|2018|https://www.youtube.com/watch?v=5ado75KpV9w",
  "global-massive-2018-alec-benjamin-if-we-have-each-other|If We Have Each Other|Alec Benjamin|2018|https://www.youtube.com/watch?v=tscMSXk_jaQ",
  "global-massive-2019-alec-benjamin-mind-is-a-prison|Mind Is A Prison|Alec Benjamin|2019|https://www.youtube.com/watch?v=bcvsE4C1JnU",
  "global-massive-2013-bastille-pompeii|Pompeii|Bastille|2013|https://www.youtube.com/watch?v=F90Cw4l-8NY",
  "global-massive-2013-bastille-things-we-lost-in-the-fire|Things We Lost In The Fire|Bastille|2013|https://www.youtube.com/watch?v=MGR4U7W1dZU",
  "global-massive-2018-bastille-quarter-past-midnight|Quarter Past Midnight|Bastille|2018|https://www.youtube.com/watch?v=X1VzzNbfPaM",
  "global-massive-2018-lewis-capaldi-someone-you-loved|Someone You Loved|Lewis Capaldi|2018|https://www.youtube.com/watch?v=zABLecsR5UE",
  "global-massive-2019-lewis-capaldi-before-you-go|Before You Go|Lewis Capaldi|2019|https://www.youtube.com/watch?v=Jtauh8GcxBY",
  "global-massive-2023-lewis-capaldi-wish-you-the-best|Wish You The Best|Lewis Capaldi|2023|https://www.youtube.com/watch?v=QZLxVvLyKTo",
  "global-massive-2017-lewis-capaldi-bruises|Bruises|Lewis Capaldi|2017|https://www.youtube.com/watch?v=QwtRXG1QpR4",
  "global-massive-2019-lewis-capaldi-hold-me-while-you-wait|Hold Me While You Wait|Lewis Capaldi|2019|https://www.youtube.com/watch?v=ZHRXmYdwc1o",
  "global-massive-2016-bruno-mars-24k-magic|24K Magic|Bruno Mars|2016|https://www.youtube.com/watch?v=UqyT8IEBkvY",
  "global-massive-2018-bruno-mars-ft-cardi-b-finesse|Finesse|Bruno Mars ft. Cardi B|2018|https://www.youtube.com/watch?v=LsoLEjrDogU",
  "global-massive-2010-bruno-mars-marry-you|Marry You|Bruno Mars|2010|https://www.youtube.com/watch?v=dElRVQFqj-k",
  "global-massive-2012-bruno-mars-treasure|Treasure|Bruno Mars|2012|https://www.youtube.com/watch?v=nPvuNsRccVw",
  "global-massive-2021-silk-sonic-leave-the-door-open|Leave The Door Open|Silk Sonic|2021|https://www.youtube.com/watch?v=adLGHcj_fmA",
  "global-massive-2014-maroon-5-animals|Animals|Maroon 5|2014|https://www.youtube.com/watch?v=qpgTC9MDx1o",
  "global-massive-2014-maroon-5-sugar|Sugar|Maroon 5|2014|https://www.youtube.com/watch?v=09R8_2nJtjg",
  "global-massive-2004-maroon-5-she-will-be-loved|She Will Be Loved|Maroon 5|2004|https://www.youtube.com/watch?v=nIjVuRTm-dc",
  "global-massive-2011-maroon-5-ft-christina-aguilera-moves-like-jagger|Moves Like Jagger|Maroon 5 ft. Christina Aguilera|2011|https://www.youtube.com/watch?v=iEPTlhBmwRg",
  "global-massive-2012-maroon-5-ft-wiz-khalifa-payphone|Payphone|Maroon 5 ft. Wiz Khalifa|2012|https://www.youtube.com/watch?v=KRaWnd3LJfs",
  "global-massive-2002-maroon-5-this-love|This Love|Maroon 5|2002|https://www.youtube.com/watch?v=XPpTgCho5ZA",
  "global-massive-2012-maroon-5-one-more-night|One More Night|Maroon 5|2012|https://www.youtube.com/watch?v=fwK7ggA3-bU",
  "global-massive-2019-maroon-5-memories|Memories|Maroon 5|2019|https://www.youtube.com/watch?v=SlPhMPnQ58k",
  "global-massive-2015-alan-walker-faded|Faded|Alan Walker|2015|https://www.youtube.com/watch?v=60ItHLz5WEA",
  "global-massive-2016-alan-walker-alone|Alone|Alan Walker|2016|https://www.youtube.com/watch?v=1-xGerv5FOk",
  "global-massive-2017-alan-walker-the-spectre|The Spectre|Alan Walker|2017|https://www.youtube.com/watch?v=wJnBTPUQS5A",
  "global-massive-2018-alan-walker-ft-au-ra-y-tomine-harket-darkside|Darkside|Alan Walker ft. Au Ra y Tomine Harket|2018|https://www.youtube.com/watch?v=M-P4QBt-FWw",
  "global-massive-2016-alan-walker-sing-me-to-sleep|Sing Me To Sleep|Alan Walker|2016|https://www.youtube.com/watch?v=2i2khp_npdE",
  "global-massive-2019-alan-walker-sabrina-carpenter-y-farruko-on-my-way|On My Way|Alan Walker, Sabrina Carpenter y Farruko|2019|https://www.youtube.com/watch?v=6Htn1x-_-is",
  "global-massive-2012-james-arthur-impossible|Impossible|James Arthur|2012|https://www.youtube.com/watch?v=Mhj15W23IjA",
  "global-massive-2016-james-arthur-say-you-won-t-let-go|Say You Won't Let Go|James Arthur|2016|https://www.youtube.com/watch?v=0yW7w8F2TVA",
  "global-massive-2017-james-arthur-naked|Naked|James Arthur|2017|https://www.youtube.com/watch?v=WXyLdg4mJxo",
  "global-massive-2019-james-arthur-falling-like-the-stars|Falling Like The Stars|James Arthur|2019|https://www.youtube.com/watch?v=PMGY8fLwess",
  "global-massive-2017-james-arthur-y-anne-marie-rewrite-the-stars|Rewrite The Stars|James Arthur y Anne-Marie|2017|https://www.youtube.com/watch?v=pRfmrE0ToTo",
  "global-massive-2019-sech-ft-darell-otro-trago|Otro Trago|Sech ft. Darell|2019|https://www.youtube.com/watch?v=t_qn-f7XfJo",
  "global-massive-2020-sech-relacion|Relación|Sech|2020|https://www.youtube.com/watch?v=c6D8v6DhKc4",
  "global-massive-2021-sech-911|911|Sech|2021|https://www.youtube.com/watch?v=URdNstAiuaE",
  "global-massive-2021-sech-daddy-yankee-y-j-balvin-sal-y-perrea-remix|Sal y Perrea Remix|Sech, Daddy Yankee y J Balvin|2021|https://www.youtube.com/watch?v=W1wb48oamzA",
  "global-massive-2016-cnco-reggaeton-lento|Reggaetón Lento|CNCO|2016|https://www.youtube.com/watch?v=7jpqqBX-Myw",
  "global-massive-2017-cnco-y-yandel-hey-dj|Hey DJ|CNCO y Yandel|2017|https://www.youtube.com/watch?v=X6wQOW9ihDA",
  "global-massive-2016-cnco-tan-facil|Tan Fácil|CNCO|2016|https://www.youtube.com/watch?v=dswcPD0XwTc",
  "global-massive-2018-cnco-mamita|Mamita|CNCO|2018|https://www.youtube.com/watch?v=OHELU6I10wQ",
  "global-massive-2011-beyonce-love-on-top|Love On Top|Beyoncé|2011|https://www.youtube.com/watch?v=Ob7vObnFUJc",
  "global-massive-2011-beyonce-run-the-world|Run The World|Beyoncé|2011|https://www.youtube.com/watch?v=VBmMU_iwe6U",
  "global-massive-2013-beyonce-ft-jay-z-drunk-in-love|Drunk In Love|Beyoncé ft. Jay-Z|2013|https://www.youtube.com/watch?v=p1JPKLa-Ofc",
  "global-massive-2006-beyonce-irreplaceable|Irreplaceable|Beyoncé|2006|https://www.youtube.com/watch?v=2EwViQxSJJQ",
  "global-massive-2007-beyonce-y-shakira-beautiful-liar|Beautiful Liar|Beyoncé y Shakira|2007|https://www.youtube.com/watch?v=QrOe2h9RtWI",
  "global-massive-2024-beyonce-texas-hold-em|Texas Hold Em|Beyoncé|2024|https://www.youtube.com/watch?v=l49aGzpvGFo",
  "global-massive-2011-jessie-j-ft-b-o-b-price-tag|Price Tag|Jessie J ft. B.o.B|2011|https://www.youtube.com/watch?v=qMxX-QOV9tI",
  "global-massive-2011-jessie-j-domino|Domino|Jessie J|2011|https://www.youtube.com/watch?v=UJtB55MaoD0",
  "global-massive-2015-jessie-j-flashlight|Flashlight|Jessie J|2015|https://www.youtube.com/watch?v=DzwkcbTQ7ZE",
  "global-massive-2014-jessie-j-ariana-grande-y-nicki-minaj-bang-bang|Bang Bang|Jessie J, Ariana Grande y Nicki Minaj|2014|https://www.youtube.com/watch?v=0HDdjwpPM3Y",
  "global-massive-2011-jessie-j-who-you-are|Who You Are|Jessie J|2011|https://www.youtube.com/watch?v=j2WWrupMBAE",
  "global-massive-2014-jessie-j-masterpiece|Masterpiece|Jessie J|2014|https://www.youtube.com/watch?v=PTOFEgJ9zzI",
  "global-massive-2004-john-legend-ordinary-people|Ordinary People|John Legend|2004|https://www.youtube.com/watch?v=PIh07c_P4hc",
  "global-massive-2012-john-legend-ft-ludacris-tonight|Tonight|John Legend ft. Ludacris|2012|https://www.youtube.com/watch?v=iXvy8ZeCs5M",
  "global-massive-2011-david-guetta-ft-sia-titanium|Titanium|David Guetta ft. Sia|2011|https://www.youtube.com/watch?v=JRfuAukYTKg",
  "global-massive-2009-david-guetta-ft-kid-cudi-memories|Memories|David Guetta ft. Kid Cudi|2009|https://www.youtube.com/watch?v=NUVCQXMUVnI",
  "global-massive-2009-david-guetta-ft-akon-sexy-bitch|Sexy Bitch|David Guetta ft. Akon|2009|https://www.youtube.com/watch?v=N9hazmsUxrM",
  "global-massive-2011-david-guetta-ft-usher-without-you|Without You|David Guetta ft. Usher|2011|https://www.youtube.com/watch?v=jUe8uoKdHao",
  "global-massive-2012-david-guetta-ft-sia-she-wolf|She Wolf|David Guetta ft. Sia|2012|https://www.youtube.com/watch?v=PVzljDmoPVs",
  "global-massive-2015-david-guetta-ft-nicki-minaj-bebe-rexha-y-afrojack-hey-mama|Hey Mama|David Guetta ft. Nicki Minaj, Bebe Rexha y Afrojack|2015|https://www.youtube.com/watch?v=uO59tfQ2TbA",
  "global-massive-2022-david-guetta-y-bebe-rexha-i-m-good|I'm Good|David Guetta y Bebe Rexha|2022|https://www.youtube.com/watch?v=90RLzVUuXe4",
  "global-massive-2018-david-guetta-y-sia-flames|Flames|David Guetta y Sia|2018|https://www.youtube.com/watch?v=J75enyWdbBM",
  "global-massive-2007-david-guetta-love-is-gone|Love Is Gone|David Guetta|2007|https://www.youtube.com/watch?v=beGjncfEPt8",
  "global-massive-2015-jason-derulo-want-to-want-me|Want To Want Me|Jason Derulo|2015|https://www.youtube.com/watch?v=rClUOdS5Zyw",
  "global-massive-2013-jason-derulo-ft-2-chainz-talk-dirty|Talk Dirty|Jason Derulo ft. 2 Chainz|2013|https://www.youtube.com/watch?v=RbtPXFlZlHg",
  "global-massive-2009-jason-derulo-whatcha-say|Whatcha Say|Jason Derulo|2009|https://www.youtube.com/watch?v=pBI3lc18k8Q",
  "global-massive-2009-jason-derulo-in-my-head|In My Head|Jason Derulo|2009|https://www.youtube.com/watch?v=UyG1FG3H6rY",
  "global-massive-2010-jason-derulo-ridin-solo|Ridin' Solo|Jason Derulo|2010|https://www.youtube.com/watch?v=8ESdn0MuJWQ",
  "global-massive-2013-jason-derulo-the-other-side|The Other Side|Jason Derulo|2013|https://www.youtube.com/watch?v=byp94CCWKSI",
  "global-massive-2010-katy-perry-ft-snoop-dogg-california-gurls|California Gurls|Katy Perry ft. Snoop Dogg|2010|https://www.youtube.com/watch?v=F57P9C4SAW4",
  "global-massive-2011-katy-perry-last-friday-night|Last Friday Night|Katy Perry|2011|https://www.youtube.com/watch?v=KlyXNRrsk4A",
  "global-massive-2012-katy-perry-wide-awake|Wide Awake|Katy Perry|2012|https://www.youtube.com/watch?v=k0BWlvnBmIE",
  "global-massive-2012-katy-perry-part-of-me|Part Of Me|Katy Perry|2012|https://www.youtube.com/watch?v=uuwfgXD8qV8",
  "global-massive-2008-katy-perry-hot-n-cold|Hot N Cold|Katy Perry|2008|https://www.youtube.com/watch?v=kTHNpusq654",
  "global-massive-2013-avicii-wake-me-up|Wake Me Up|Avicii|2013|https://www.youtube.com/watch?v=IcrbM1l_BoI",
  "global-massive-2011-avicii-levels|Levels|Avicii|2011|https://www.youtube.com/watch?v=_ovdm2yX4MA",
  "global-massive-2014-avicii-the-nights|The Nights|Avicii|2014|https://www.youtube.com/watch?v=UtF6Jej8yb4",
  "global-massive-2015-avicii-waiting-for-love|Waiting For Love|Avicii|2015|https://www.youtube.com/watch?v=cHHLHGNpCSA",
  "global-massive-2013-avicii-addicted-to-you|Addicted To You|Avicii|2013|https://www.youtube.com/watch?v=Qc9c12q3mrc",
  "global-massive-2017-avicii-ft-sandro-cavazza-without-you|Without You|Avicii ft. Sandro Cavazza|2017|https://www.youtube.com/watch?v=zZXJoPe0oH8",
  "global-massive-2013-magic-rude|Rude|MAGIC!|2013|https://www.youtube.com/watch?v=PIh2xe4jnpk",
  "global-massive-2014-magic-no-way-no|No Way No|MAGIC!|2014|https://www.youtube.com/watch?v=HdobynnfKQE",
  "global-massive-2016-magic-red-dress|Red Dress|MAGIC!|2016|https://www.youtube.com/watch?v=FaX64o71vGQ",
  "global-massive-2013-onerepublic-counting-stars|Counting Stars|OneRepublic|2013|https://www.youtube.com/watch?v=hT_nvWreIhg",
  "global-massive-2014-onerepublic-i-lived|I Lived|OneRepublic|2014|https://www.youtube.com/watch?v=z0rxydSolwU",
  "global-massive-2009-onerepublic-secrets|Secrets|OneRepublic|2009|https://www.youtube.com/watch?v=qHm9MG9xw1o",
  "global-massive-2010-onerepublic-good-life|Good Life|OneRepublic|2010|https://www.youtube.com/watch?v=jZhQOvvV45w",
  "global-massive-2007-onerepublic-stop-and-stare|Stop And Stare|OneRepublic|2007|https://www.youtube.com/watch?v=HtNS1afUOnE",
  "global-massive-2013-onerepublic-if-i-lose-myself|If I Lose Myself|OneRepublic|2013|https://www.youtube.com/watch?v=TGx0rApSk6w",
  "global-massive-2016-the-chainsmokers-ft-halsey-closer|Closer|The Chainsmokers ft. Halsey|2016|https://www.youtube.com/watch?v=0zGcUoRlhmw",
  "global-massive-2016-the-chainsmokers-ft-daya-don-t-let-me-down|Don't Let Me Down|The Chainsmokers ft. Daya|2016|https://www.youtube.com/watch?v=Io0fBr1XBUA",
  "global-massive-2015-the-chainsmokers-ft-rozes-roses|Roses|The Chainsmokers ft. ROZES|2015|https://www.youtube.com/watch?v=G5Mv2iV0wkU",
  "global-massive-2017-the-chainsmokers-y-coldplay-something-just-like-this|Something Just Like This|The Chainsmokers y Coldplay|2017|https://www.youtube.com/watch?v=FM7MFYoylVs",
  "global-massive-2016-ariana-grande-ft-nicki-minaj-side-to-side|Side To Side|Ariana Grande ft. Nicki Minaj|2016|https://www.youtube.com/watch?v=SXiSVQZLje8",
  "global-massive-2020-ariana-grande-positions|positions|Ariana Grande|2020|https://www.youtube.com/watch?v=tcYodQoapMg",
  "global-massive-2018-ariana-grande-god-is-a-woman|God Is a Woman|Ariana Grande|2018|https://www.youtube.com/watch?v=kHLHSlExFis",
  "global-massive-2015-ariana-grande-focus|Focus|Ariana Grande|2015|https://www.youtube.com/watch?v=lf_wVfwpfp8",
  "global-massive-2024-ariana-grande-we-can-t-be-friends|we can't be friends|Ariana Grande|2024|https://www.youtube.com/watch?v=KNtJGQkC-WI",
  "global-massive-2024-ariana-grande-yes-and|yes, and?|Ariana Grande|2024|https://www.youtube.com/watch?v=eB6txyhHFG4",
  "global-massive-2012-nicki-minaj-starships|Starships|Nicki Minaj|2012|https://www.youtube.com/watch?v=SeIJmciN8mo",
  "global-massive-2011-nicki-minaj-super-bass|Super Bass|Nicki Minaj|2011|https://www.youtube.com/watch?v=4JipHEz53sU",
  "global-massive-2014-nicki-minaj-anaconda|Anaconda|Nicki Minaj|2014|https://www.youtube.com/watch?v=LDZX4ooRsWs",
  "global-massive-2014-nicki-minaj-pills-n-potions|Pills N Potions|Nicki Minaj|2014|https://www.youtube.com/watch?v=f7ld-3nZUxA",
  "global-massive-2016-sia-ft-sean-paul-cheap-thrills|Cheap Thrills|Sia ft. Sean Paul|2016|https://www.youtube.com/watch?v=nYh-n7EOtMA",
  "global-massive-2013-sia-elastic-heart|Elastic Heart|Sia|2013|https://www.youtube.com/watch?v=KWZGAExj-es",
  "global-massive-2016-sia-ft-kendrick-lamar-the-greatest|The Greatest|Sia ft. Kendrick Lamar|2016|https://www.youtube.com/watch?v=sG6aWhZnbfw",
  "global-massive-2016-sia-unstoppable|Unstoppable|Sia|2016|https://www.youtube.com/watch?v=YaEG2aWJnZ8",
  "global-massive-2016-rihanna-ft-drake-work|Work|Rihanna ft. Drake|2016|https://www.youtube.com/watch?v=HL1UzIK-flA",
  "global-massive-2010-rihanna-only-girl|Only Girl|Rihanna|2010|https://www.youtube.com/watch?v=pa14VNsdSYM",
  "global-massive-2009-rihanna-rude-boy|Rude Boy|Rihanna|2009|https://www.youtube.com/watch?v=e82VE8UtW8A",
  "global-massive-2010-eminem-ft-rihanna-love-the-way-you-lie|Love The Way You Lie|Eminem ft. Rihanna|2010|https://www.youtube.com/watch?v=uelHwf8o7_U",
  "global-massive-2010-rihanna-ft-drake-what-s-my-name|What's My Name|Rihanna ft. Drake|2010|https://www.youtube.com/watch?v=U0CGsw6h60k",
  "global-massive-2006-rihanna-sos|SOS|Rihanna|2006|https://www.youtube.com/watch?v=IXmF4GbA86E",
  "global-massive-2007-rihanna-don-t-stop-the-music|Don't Stop The Music|Rihanna|2007|https://www.youtube.com/watch?v=yd8jh9QYfEs",
  "global-massive-2015-zara-larsson-lush-life|Lush Life|Zara Larsson|2015|https://www.youtube.com/watch?v=tD4HCZe-tew",
  "global-massive-2015-zara-larsson-y-mnek-never-forget-you|Never Forget You|Zara Larsson y MNEK|2015|https://www.youtube.com/watch?v=GTyN-DB_v5M",
  "global-massive-2016-zara-larsson-ain-t-my-fault|Ain't My Fault|Zara Larsson|2016|https://www.youtube.com/watch?v=eC-F_VZ2T1c",
  "global-massive-2018-zara-larsson-ruin-my-life|Ruin My Life|Zara Larsson|2018|https://www.youtube.com/watch?v=3OTjFqWcDQY",
  "global-massive-2023-zara-larsson-y-david-guetta-on-my-love|On My Love|Zara Larsson y David Guetta|2023|https://www.youtube.com/watch?v=Gudx8Bvnqsg",
  "global-massive-2011-one-direction-what-makes-you-beautiful|What Makes You Beautiful|One Direction|2011|https://www.youtube.com/watch?v=QJO3ROT-A4E",
  "global-massive-2013-one-direction-story-of-my-life|Story of My Life|One Direction|2013|https://www.youtube.com/watch?v=W-TE_Ys4iwM",
  "global-massive-2015-one-direction-drag-me-down|Drag Me Down|One Direction|2015|https://www.youtube.com/watch?v=Jwgf3wmiA04",
  "global-massive-2014-one-direction-night-changes|Night Changes|One Direction|2014|https://www.youtube.com/watch?v=syFZfO_wfMQ",
  "global-massive-2011-one-direction-one-thing|One Thing|One Direction|2011|https://www.youtube.com/watch?v=Y1xs_xPb46M",
  "global-massive-2012-one-direction-live-while-we-re-young|Live While We're Young|One Direction|2012|https://www.youtube.com/watch?v=AbPED9bisSc",
  "global-massive-2016-zayn-pillowtalk|Pillowtalk|ZAYN|2016|https://www.youtube.com/watch?v=C_3d6GntKbk",
  "global-massive-2017-zayn-ft-sia-dusk-till-dawn|Dusk Till Dawn|ZAYN ft. Sia|2017|https://www.youtube.com/watch?v=tt2k8PGm-TI",
  "global-massive-2016-zayn-y-taylor-swift-i-don-t-wanna-live-forever|I Don't Wanna Live Forever|ZAYN y Taylor Swift|2016|https://www.youtube.com/watch?v=AY9blLYMKnI",
  "global-massive-2016-zayn-like-i-would|Like I Would|ZAYN|2016|https://www.youtube.com/watch?v=pTaqcGz2O5o",
  "global-massive-2008-el-canto-del-loco-eres-tonto|Eres Tonto|El Canto del Loco|2008|https://www.youtube.com/watch?v=lNw7YxhzQAU",
  "global-massive-2008-el-canto-del-loco-peter-pan|Peter Pan|El Canto del Loco|2008|https://www.youtube.com/watch?v=rCxLx_3T5GE",
  "global-massive-2002-el-canto-del-loco-son-suenos|Son Sueños|El Canto del Loco|2002|https://www.youtube.com/watch?v=DWoRpJ_MVZk",
  "global-massive-2012-efecto-pasillo-pan-y-mantequilla|Pan y Mantequilla|Efecto Pasillo|2012|https://www.youtube.com/watch?v=a5Hp4K0PwRQ",
  "global-massive-2013-efecto-pasillo-no-importa-que-llueva|No Importa Que Llueva|Efecto Pasillo|2013|https://www.youtube.com/watch?v=n9qU9kVc6jM",
  "global-massive-2015-efecto-pasillo-cuando-me-siento-bien|Cuando Me Siento Bien|Efecto Pasillo|2015|https://www.youtube.com/watch?v=hvaqFn5dvhU",
  "global-massive-2021-bad-bunny-yonaguni|Yonaguni|Bad Bunny|2021|https://www.youtube.com/watch?v=doLMt10ytHY",
  "global-massive-2019-bad-bunny-y-tainy-callaita|Callaita|Bad Bunny y Tainy|2019|https://www.youtube.com/watch?v=acEOASYioGY",
  "global-massive-2018-bad-bunny-amorfoda|Amorfoda|Bad Bunny|2018|https://www.youtube.com/watch?v=kLpH1nSLJSs",
  "global-massive-2018-bad-bunny-ft-drake-mia|Mía|Bad Bunny ft. Drake|2018|https://www.youtube.com/watch?v=OSUxrSe5GbI",
  "global-massive-2022-bad-bunny-moscow-mule|Moscow Mule|Bad Bunny|2022|https://www.youtube.com/watch?v=p38WgakuYDo",
  "global-massive-2022-bad-bunny-y-bomba-estereo-ojitos-lindos|Ojitos Lindos|Bad Bunny y Bomba Estéreo|2022|https://www.youtube.com/watch?v=wAjHQXrIj9o",
  "global-massive-2022-bad-bunny-efecto|Efecto|Bad Bunny|2022|https://www.youtube.com/watch?v=Nk8C9FdCdJQ",
  "global-massive-2023-bad-bunny-where-she-goes|WHERE SHE GOES|Bad Bunny|2023|https://www.youtube.com/watch?v=bef8QLNHubw",
  "global-massive-2023-bad-bunny-monaco|MONACO|Bad Bunny|2023|https://www.youtube.com/watch?v=_PJvpq8uOZM",
  "global-massive-2016-j-balvin-ft-pharrell-williams-bia-y-sky-safari|Safari|J Balvin ft. Pharrell Williams, BIA y Sky|2016|https://www.youtube.com/watch?v=JWESLtAKKlU",
  "global-massive-2013-j-balvin-ft-farruko-6-am|6 AM|J Balvin ft. Farruko|2013|https://www.youtube.com/watch?v=yUV9JwiQLog",
  "global-massive-2015-j-balvin-ginza|Ginza|J Balvin|2015|https://www.youtube.com/watch?v=zZjSX01P5dE",
  "global-massive-2018-j-balvin-reggaeton|Reggaeton|J Balvin|2018|https://www.youtube.com/watch?v=6DHDIDgn2oA",
  "global-massive-2020-j-balvin-morado|Morado|J Balvin|2020|https://www.youtube.com/watch?v=d5ZVaWxkAaQ",
  "global-massive-2020-j-balvin-azul|Azul|J Balvin|2020|https://www.youtube.com/watch?v=bcaLBKH-Yfc",
  "global-massive-2019-j-balvin-blanco|Blanco|J Balvin|2019|https://www.youtube.com/watch?v=8j1xiiAZhIQ",
  "global-massive-2021-j-balvin-y-skrillex-in-da-getto|In Da Getto|J Balvin y Skrillex|2021|https://www.youtube.com/watch?v=MjlTKXujfwE",
  "global-massive-2020-the-weeknd-save-your-tears|Save Your Tears|The Weeknd|2020|https://www.youtube.com/watch?v=XXYlFuWEuKI",
  "global-massive-2015-the-weeknd-the-hills|The Hills|The Weeknd|2015|https://www.youtube.com/watch?v=yzTuBuRdAyA",
  "global-massive-2014-the-weeknd-earned-it|Earned It|The Weeknd|2014|https://www.youtube.com/watch?v=waU75jdUnYw",
  "global-massive-2016-the-weeknd-die-for-you|Die For You|The Weeknd|2016|https://www.youtube.com/watch?v=uPD0QOGTmMI",
  "global-massive-2020-babi-colegas|Colegas|Babi|2020|https://www.youtube.com/watch?v=zDcBO_RVU58",
  "global-massive-2020-babi-lo-jodiste|Lo Jodiste|Babi|2020|https://www.youtube.com/watch?v=_I9tUzuC0Ns",
  "global-massive-2019-babi-rota|Rota|Babi|2019|https://www.youtube.com/watch?v=l1SEbHOKlA8",
  "global-massive-2021-babi-desierto|Desierto|Babi|2021|https://www.youtube.com/watch?v=DujG8xI5Ndc",
  "global-massive-2016-lp-other-people|Other People|LP|2016|https://www.youtube.com/watch?v=Lv8VKCz3Cdg",
  "global-massive-2018-lp-girls-go-wild|Girls Go Wild|LP|2018|https://www.youtube.com/watch?v=M7XRN0oHGIM",
  "global-massive-2014-imagine-dragons-warriors|Warriors|Imagine Dragons|2014|https://www.youtube.com/watch?v=fmI_Ndrxy14",
  "global-massive-2017-imagine-dragons-thunder|Thunder|Imagine Dragons|2017|https://www.youtube.com/watch?v=fKopy74weus",
  "global-massive-2017-imagine-dragons-whatever-it-takes|Whatever It Takes|Imagine Dragons|2017|https://www.youtube.com/watch?v=gOsM-DYAEhY",
  "global-massive-2018-imagine-dragons-natural|Natural|Imagine Dragons|2018|https://www.youtube.com/watch?v=0I647GU3Jsc",
  "global-massive-2021-imagine-dragons-y-jid-enemy|Enemy|Imagine Dragons y JID|2021|https://www.youtube.com/watch?v=D9G1VOjN_84",
  "global-massive-2012-imagine-dragons-on-top-of-the-world|On Top Of The World|Imagine Dragons|2012|https://www.youtube.com/watch?v=w5tWYmIOWGk",
  "global-massive-2012-imagine-dragons-it-s-time|It's Time|Imagine Dragons|2012|https://www.youtube.com/watch?v=sENM2wA_FTg",
  "global-massive-2004-bebe-ella|Ella|Bebe|2004|https://www.youtube.com/watch?v=IhTOKqwXgzQ",
  "global-massive-2004-bebe-malo|Malo|Bebe|2004|https://www.youtube.com/watch?v=90GqAf3zJ8s",
  "global-massive-2004-bebe-siempre-me-quedara|Siempre Me Quedará|Bebe|2004|https://www.youtube.com/watch?v=QsjAgjbMVWA",
  "global-massive-2023-karol-g-mientras-me-curo-del-cora|Mientras Me Curo Del Cora|Karol G|2023|https://www.youtube.com/watch?v=37wmW9kYAlQ",
  "global-massive-2022-becky-g-y-karol-g-mamiii|Mamiii|Becky G y Karol G|2022|https://www.youtube.com/watch?v=flL8ZMqIWGA",
  "global-massive-2022-karol-g-y-ovy-on-the-drums-cairo|Cairo|Karol G y Ovy On The Drums|2022|https://www.youtube.com/watch?v=Z02zptUN8gI",
  "global-massive-2023-karol-g-mi-ex-tenia-razon|Mi Ex Tenía Razón|Karol G|2023|https://www.youtube.com/watch?v=VBcs8DZxBGc",
  "global-massive-2023-karol-g-amargura|Amargura|Karol G|2023|https://www.youtube.com/watch?v=bnwhPE_jd9A",
  "global-massive-2021-karol-g-y-mariah-angeliq-el-makinon|El Makinon|Karol G y Mariah Angeliq|2021|https://www.youtube.com/watch?v=2jYEz66J_J4",
  "global-massive-2019-karol-g-ocean|Ocean|Karol G|2019|https://www.youtube.com/watch?v=gyY5Z0TUWRY",
  "global-massive-2020-camilo-favorito|Favorito|Camilo|2020|https://www.youtube.com/watch?v=2mY7AFTtYwQ",
  "global-massive-2019-camilo-y-pedro-capo-tutu|Tutu|Camilo y Pedro Capó|2019|https://www.youtube.com/watch?v=5AkDqm-cEgg",
  "global-massive-2021-camilo-y-evaluna-montaner-indigo|Índigo|Camilo y Evaluna Montaner|2021|https://www.youtube.com/watch?v=DriCCFRQlj8",
  "global-massive-2021-camilo-ropa-cara|Ropa Cara|Camilo|2021|https://www.youtube.com/watch?v=YrtMpe0WOpc",
  "global-massive-2021-camilo-kesi|Kesi|Camilo|2021|https://www.youtube.com/watch?v=ZrUrwUwSHR0",
  "global-massive-2021-camilo-manos-de-tijera|Manos de Tijera|Camilo|2021|https://www.youtube.com/watch?v=cs0_s6o8uAI",
  "global-massive-2023-myke-towers-lala|Lala|Myke Towers|2023|https://www.youtube.com/watch?v=BVdngsy95mY",
  "global-massive-2020-myke-towers-girl|Girl|Myke Towers|2020|https://www.youtube.com/watch?v=5VOP0A491sg",
  "global-massive-2021-sebastian-yatra-y-myke-towers-pareja-del-ano|Pareja del Año|Sebastián Yatra y Myke Towers|2021|https://www.youtube.com/watch?v=ECSjNFUJYAI",
  "global-massive-2020-myke-towers-y-juhn-bandido|Bandido|Myke Towers y Juhn|2020|https://www.youtube.com/watch?v=W6fme7tcweQ",
  "global-massive-1999-estopa-por-la-raja-de-tu-falda|Por La Raja de Tu Falda|Estopa|1999|https://www.youtube.com/watch?v=wECwsE4yNSQ",
  "global-massive-2019-estopa-fuego|Fuego|Estopa|2019|https://www.youtube.com/watch?v=cFMhNeEkzUk",
  "global-massive-1999-estopa-me-falta-el-aliento|Me Falta el Aliento|Estopa|1999|https://www.youtube.com/watch?v=NaTpa8jdNsw",
  "global-massive-2020-dua-lipa-physical|Physical|Dua Lipa|2020|https://www.youtube.com/watch?v=9HDEHj2yzew",
  "global-massive-2020-dua-lipa-break-my-heart|Break My Heart|Dua Lipa|2020|https://www.youtube.com/watch?v=Nj2U6rhnucI",
  "global-massive-2020-dua-lipa-hallucinate|Hallucinate|Dua Lipa|2020|https://www.youtube.com/watch?v=qcZ7e9EOQTY",
  "global-massive-2017-dua-lipa-idgaf|IDGAF|Dua Lipa|2017|https://www.youtube.com/watch?v=Mgfe5tIwOj0",
  "global-massive-2015-dua-lipa-be-the-one|Be The One|Dua Lipa|2015|https://www.youtube.com/watch?v=-rey3m8SWQI",
  "global-massive-2021-dua-lipa-love-again|Love Again|Dua Lipa|2021|https://www.youtube.com/watch?v=BC19kwABFwc",
  "global-massive-2014-calvin-harris-summer|Summer|Calvin Harris|2014|https://www.youtube.com/watch?v=ebXbLfLACGM",
  "global-massive-2016-calvin-harris-ft-rihanna-this-is-what-you-came-for|This Is What You Came For|Calvin Harris ft. Rihanna|2016|https://www.youtube.com/watch?v=kOkQ4T5WO9E",
  "global-massive-2014-calvin-harris-ft-ellie-goulding-outside|Outside|Calvin Harris ft. Ellie Goulding|2014|https://www.youtube.com/watch?v=J9NQFACZYEU",
  "global-massive-2015-calvin-harris-y-disciples-how-deep-is-your-love|How Deep Is Your Love|Calvin Harris y Disciples|2015|https://www.youtube.com/watch?v=EgqUJOudrcM",
  "global-massive-2016-calvin-harris-my-way|My Way|Calvin Harris|2016|https://www.youtube.com/watch?v=b4Bj7Zb-YD4",
  "global-massive-2012-calvin-harris-ft-florence-welch-sweet-nothing|Sweet Nothing|Calvin Harris ft. Florence Welch|2012|https://www.youtube.com/watch?v=17ozSeGw-fY",
  "global-massive-2018-calvin-harris-y-dua-lipa-one-kiss|One Kiss|Calvin Harris y Dua Lipa|2018|https://www.youtube.com/watch?v=DkeiKbqa02g",
  "global-massive-2009-lily-allen-not-fair|Not Fair|Lily Allen|2009|https://www.youtube.com/watch?v=fUYaosyR4bE",
  "global-massive-2009-lily-allen-fuck-you|Fuck You|Lily Allen|2009|https://www.youtube.com/watch?v=yFE6qQ3ySXE",
  "global-massive-2008-lily-allen-the-fear|The Fear|Lily Allen|2008|https://www.youtube.com/watch?v=q-wGMlSuX_c",
  "global-massive-2013-lily-allen-somewhere-only-we-know|Somewhere Only We Know|Lily Allen|2013|https://www.youtube.com/watch?v=mer6X7nOY_o",
  "global-massive-2017-julia-michaels-issues|Issues|Julia Michaels|2017|https://www.youtube.com/watch?v=9Ke4480MicU",
  "global-massive-2018-julia-michaels-heaven|Heaven|Julia Michaels|2018|https://www.youtube.com/watch?v=shHTYg-rOAg",
  "global-massive-2019-julia-michaels-ft-selena-gomez-anxiety|Anxiety|Julia Michaels ft. Selena Gomez|2019|https://www.youtube.com/watch?v=Q33DvcjXA7M",
  "global-massive-2014-clean-bandit-ft-jess-glynne-rather-be|Rather Be|Clean Bandit ft. Jess Glynne|2014|https://www.youtube.com/watch?v=m-M1AtrxztU",
  "global-massive-2016-clean-bandit-ft-sean-paul-y-anne-marie-rockabye|Rockabye|Clean Bandit ft. Sean Paul y Anne-Marie|2016|https://www.youtube.com/watch?v=papuvlVeZg8",
  "global-massive-2018-clean-bandit-ft-demi-lovato-solo|Solo|Clean Bandit ft. Demi Lovato|2018|https://www.youtube.com/watch?v=8JnfIa84TnU",
  "global-massive-2019-clean-bandit-ft-ellie-goulding-mama|Mama|Clean Bandit ft. Ellie Goulding|2019|https://www.youtube.com/watch?v=Ao3XJ-UDdzI",
  "global-massive-2019-lil-nas-x-ft-billy-ray-cyrus-old-town-road|Old Town Road|Lil Nas X ft. Billy Ray Cyrus|2019|https://www.youtube.com/watch?v=r7qovpFAGrQ",
  "global-massive-2021-lil-nas-x-montero|MONTERO|Lil Nas X|2021|https://www.youtube.com/watch?v=6swmTBVI83k",
  "global-massive-2019-lil-nas-x-panini|Panini|Lil Nas X|2019|https://www.youtube.com/watch?v=bXcSLI58-h8",
  "global-massive-2021-lil-nas-x-thats-what-i-want|Thats What I Want|Lil Nas X|2021|https://www.youtube.com/watch?v=QDYDRA5JPLE",
  "global-massive-1967-aretha-franklin-respect|Respect|Aretha Franklin|1967|https://www.youtube.com/watch?v=U0yIf9Tkgu4",
  "global-massive-1968-aretha-franklin-i-say-a-little-prayer|I Say a Little Prayer|Aretha Franklin|1968|https://www.youtube.com/watch?v=TDyiREoBw0o",
  "global-massive-1968-aretha-franklin-think|Think|Aretha Franklin|1968|https://www.youtube.com/watch?v=Vet6AHmq3_s",
  "global-massive-1967-aretha-franklin-natural-woman|Natural Woman|Aretha Franklin|1967|https://www.youtube.com/watch?v=8jCFzreP1ng",
  "global-massive-2015-drake-hotline-bling|Hotline Bling|Drake|2015|https://www.youtube.com/watch?v=uxpDa-c-4Mc",
  "global-massive-2016-drake-ft-wizkid-y-kyla-one-dance|One Dance|Drake ft. Wizkid y Kyla|2016|https://www.youtube.com/watch?v=kU56R-1KFLc",
  "global-massive-2018-drake-in-my-feelings|In My Feelings|Drake|2018|https://www.youtube.com/watch?v=DRS_PpOrUZ4",
  "global-massive-2017-drake-passionfruit|Passionfruit|Drake|2017|https://www.youtube.com/watch?v=EgfsXTOn_pI",
  "global-massive-2018-drake-nice-for-what|Nice For What|Drake|2018|https://www.youtube.com/watch?v=U9BwWKXjVaI",
  "global-massive-2016-kase-o-repartiendo-arte|Repartiendo Arte|Kase.O|2016|https://www.youtube.com/watch?v=1vbZMpRTT5M",
  "global-massive-2016-kase-o-yemen|Yemen|Kase.O|2016|https://www.youtube.com/watch?v=YGICYKnIm2A",
  "global-massive-2016-kase-o-esto-no-para|Esto No Para|Kase.O|2016|https://www.youtube.com/watch?v=9JAAh8P-PnU",
  "global-massive-2016-kase-o-mazas-y-catapultas|Mazas y Catapultas|Kase.O|2016|https://www.youtube.com/watch?v=onOti-CEIq8",
  "global-massive-2020-trueno-y-nicki-nicole-mamichula|Mamichula|Trueno y Nicki Nicole|2020|https://www.youtube.com/watch?v=7USnBu69MO0",
  "global-massive-2023-trueno-tierra-zanta|Tierra Zanta|Trueno|2023|https://www.youtube.com/watch?v=POAdMW-4yfw",
  "global-massive-2024-trueno-real-gangsta-love|Real Gangsta Love|Trueno|2024|https://www.youtube.com/watch?v=gaxbVfsoF6Q",
  "global-massive-2023-trueno-tranky-funky|Tranky Funky|Trueno|2023|https://www.youtube.com/watch?v=8YY2c2u9L2c",
  "global-massive-2020-nicki-nicole-colocao|Colocao|Nicki Nicole|2020|https://www.youtube.com/watch?v=kh1sF-sbkbw",
  "global-massive-2023-nicki-nicole-y-milo-j-dispara|Dispara|Nicki Nicole y Milo J|2023|https://www.youtube.com/watch?v=NIFzAl5382o",
  "global-massive-2022-tiago-pzk-lit-killah-nicki-nicole-y-maria-becerra-entre-nosotros-remix|Entre Nosotros Remix|Tiago PZK, LIT Killah, Nicki Nicole y Maria Becerra|2022|https://www.youtube.com/watch?v=pbta6KQi410",
  "global-massive-2018-lit-killah-la-trampa-es-ley|La Trampa Es Ley|LIT killah|2018|https://www.youtube.com/watch?v=qyc07COpZDQ",
  "global-massive-2020-lit-killah-flexin|Flexin|LIT killah|2020|https://www.youtube.com/watch?v=YWdcQfjdzBc",
  "global-massive-2019-lit-killah-bufon|Bufón|LIT killah|2019|https://www.youtube.com/watch?v=_3DS5D20ZyA",
  "global-massive-1997-radiohead-karma-police|Karma Police|Radiohead|1997|https://www.youtube.com/watch?v=1uYWYWPc9HU",
  "global-massive-1997-radiohead-no-surprises|No Surprises|Radiohead|1997|https://www.youtube.com/watch?v=u5CVsCnxyXg",
  "global-massive-1995-radiohead-high-and-dry|High And Dry|Radiohead|1995|https://www.youtube.com/watch?v=7qFfFVSerQo",
  "global-massive-1995-radiohead-fake-plastic-trees|Fake Plastic Trees|Radiohead|1995|https://www.youtube.com/watch?v=n5h0qHwNrHk",
  "global-massive-1997-radiohead-paranoid-android|Paranoid Android|Radiohead|1997|https://www.youtube.com/watch?v=fHiGbolFFGw",
  "global-massive-2012-lana-del-rey-summertime-sadness|Summertime Sadness|Lana Del Rey|2012|https://www.youtube.com/watch?v=TdrL3QxjyVw",
  "global-massive-2011-lana-del-rey-born-to-die|Born To Die|Lana Del Rey|2011|https://www.youtube.com/watch?v=Bag1gUxuU0g",
  "global-massive-2013-lana-del-rey-young-and-beautiful|Young And Beautiful|Lana Del Rey|2013|https://www.youtube.com/watch?v=o_1aF54DO60",
  "global-massive-2012-lana-del-rey-blue-jeans|Blue Jeans|Lana Del Rey|2012|https://www.youtube.com/watch?v=JRWox-i6aAk",
  "global-massive-2014-lana-del-rey-west-coast|West Coast|Lana Del Rey|2014|https://www.youtube.com/watch?v=oKxuiw3iMBE",
  "global-massive-2019-lana-del-rey-doin-time|Doin Time|Lana Del Rey|2019|https://www.youtube.com/watch?v=qolmz4FlnZ0",
  "global-massive-2024-saiko-supernova|Supernova|Saiko|2023|https://www.youtube.com/watch?v=BbZi8xGMyuM",
  "global-massive-2023-saiko-feid-quevedo-y-mora-polaris-remix|Polaris Remix|Saiko, Feid, Quevedo y Mora|2023|https://www.youtube.com/watch?v=SkBML8JgD0k",
  "global-massive-2023-saiko-sikora|Sikora|Saiko|2023|https://www.youtube.com/watch?v=5KJWuLZPk9o",
  "global-massive-2024-saiko-yo-lo-sone|Yo Lo Soñé|Saiko|2024|https://www.youtube.com/watch?v=7dgZrswejk8",
  "global-massive-2024-saiko-badgyal|Badgyal|Saiko|2024|https://www.youtube.com/watch?v=_WHBVsQnrFc",
  "global-massive-2013-romeo-santos-propuesta-indecente|Propuesta Indecente|Romeo Santos|2013|https://www.youtube.com/watch?v=QFs3PIZb3js",
  "global-massive-2014-romeo-santos-eres-mia|Eres Mía|Romeo Santos|2014|https://www.youtube.com/watch?v=8iPcqtHoR3U",
  "global-massive-2017-romeo-santos-imitadora|Imitadora|Romeo Santos|2017|https://www.youtube.com/watch?v=FAq4OIRDo68",
  "global-massive-2017-romeo-santos-ft-ozuna-sobredosis|Sobredosis|Romeo Santos ft. Ozuna|2017|https://www.youtube.com/watch?v=JNkTNAknE4I",
  "global-massive-2014-romeo-santos-ft-drake-odio|Odio|Romeo Santos ft. Drake|2014|https://www.youtube.com/watch?v=oNRPB2wKjAI",
  "global-massive-2019-dani-fernandez-bailemos|Bailemos|Dani Fernández|2019|https://www.youtube.com/watch?v=sbzX9v1wsew",
  "global-massive-2022-dani-fernandez-te-esperare-toda-la-vida|Te Esperaré Toda La Vida|Dani Fernández|2022|https://www.youtube.com/watch?v=nUCuBrdEbUw",
  "global-massive-2022-dani-fernandez-clima-tropical|Clima Tropical|Dani Fernández|2022|https://www.youtube.com/watch?v=g69lndkT9sQ",
  "global-massive-2022-dani-fernandez-dile-a-los-demas|Dile A Los Demás|Dani Fernández|2022|https://www.youtube.com/watch?v=HKNz0DWQXZw",
  "global-massive-2024-dani-fernandez-plan-fatal|Plan Fatal|Dani Fernández|2024|https://www.youtube.com/watch?v=jBd5G2TUVSY",
  "global-massive-2023-ana-mena-musica-ligera|Música Ligera|Ana Mena|2023|https://www.youtube.com/watch?v=K340m2VwhqE",
  "global-massive-2018-ana-mena-becky-g-y-de-la-ghetto-ya-es-hora|Ya Es Hora|Ana Mena, Becky G y De La Ghetto|2018|https://www.youtube.com/watch?v=KwbtlSQLTMY",
  "global-massive-2017-ana-mena-y-cnco-ahora-lloras-tu|Ahora Lloras Tú|Ana Mena y CNCO|2017|https://www.youtube.com/watch?v=bS4aKfGnGa4",
] as const;

const GLOBAL_REQUESTED_CLASSICS_PACK_ID = "global-requested-classics-2026-08-15";

const GLOBAL_REQUESTED_CLASSICS_PACK_ROWS = [
  "global-requested-classics-1999-joaquin-sabina-19-dias-y-500-noches|19 Días y 500 Noches|Joaquín Sabina|1999|https://www.youtube.com/watch?v=qahBeZB1g54",
  "global-requested-classics-1986-alaska-y-dinarama-a-quien-le-importa|A quién le importa|Alaska Y Dinarama|1986|https://www.youtube.com/watch?v=IJGbBzgdr3o",
  "global-requested-classics-1970-the-jackson-5-abc|ABC|The Jackson 5|1970|https://www.youtube.com/watch?v=ho7796-au8U",
  "global-requested-classics-1970-dolores-vargas-achilipu|Achilipú|Dolores Vargas|1970|https://www.youtube.com/watch?v=KM0nFPSOpo0",
  "global-requested-classics-1994-sheryl-crow-all-i-wanna-do|All I Wanna Do|Sheryl Crow|1994|https://www.youtube.com/watch?v=ClbmWkbocoY",
  "global-requested-classics-1999-smash-mouth-all-star|All Star|Smash Mouth|1999|https://www.youtube.com/watch?v=L_jWHffIx5E",
  "global-requested-classics-2002-t-a-t-u-all-the-things-she-said|All The Things She Said|t.A.T.u.|2002|https://www.youtube.com/watch?v=8mGBaXPlri8",
  "global-requested-classics-2004-green-day-american-idiot|American Idiot|Green Day|2004|https://www.youtube.com/watch?v=Ee_uujKuJMI",
  "global-requested-classics-1989-phil-collins-another-day-in-paradise|Another Day in Paradise|Phil Collins|1989|https://www.youtube.com/watch?v=Qt2mbGP6vFI",
  "global-requested-classics-2017-rita-ora-anywhere|Anywhere|Rita Ora|2017|https://www.youtube.com/watch?v=ksdAs4LBRq8",
  "global-requested-classics-2022-harry-styles-as-it-was|As It Was|Harry Styles|2022|https://www.youtube.com/watch?v=H5v3kku4y6Q",
  "global-requested-classics-2001-zucchero-baila-sexy-thing|Baila (Sexy Thing)|Zucchero|2001|https://www.youtube.com/watch?v=QRDZjj7-tOk",
  "global-requested-classics-1998-vengaboys-boom-boom-boom-boom|Boom, Boom, Boom, Boom!!|Vengaboys|1998|https://www.youtube.com/watch?v=llyiQ4I-mcQ",
  "global-requested-classics-2003-evanescence-bring-me-to-life|Bring Me To Life|Evanescence|2003|https://www.youtube.com/watch?v=3YxaaGgTQYM",
  "global-requested-classics-1980-blondie-call-me|Call Me|Blondie|1980|https://www.youtube.com/watch?v=StKVS0eI85I",
  "global-requested-classics-2006-snow-patrol-chasing-cars|Chasing Cars|Snow Patrol|2006|https://www.youtube.com/watch?v=GemKqzILV4w",
  "global-requested-classics-2002-chenoa-cuando-tu-vas|Cuando Tú Vas|Chenoa|2002|https://www.youtube.com/watch?v=E2N6UahtzK4",
  "global-requested-classics-2001-camela-cuando-zarpa-el-amor|Cuando zarpa el amor|Camela|2001|https://www.youtube.com/watch?v=POePrzXBI9Q",
  "global-requested-classics-2019-mabel-don-t-call-me-up|Don't Call Me Up|Mabel|2019|https://www.youtube.com/watch?v=9TQKyDD9Yig",
  "global-requested-classics-1986-pretenders-don-t-get-me-wrong|Don't Get Me Wrong|Pretenders|1986|https://www.youtube.com/watch?v=qbAab1hTxN4",
  "global-requested-classics-2001-melody-el-baile-del-gorila|El Baile del Gorila|Melody|2001|https://www.youtube.com/watch?v=90avMgG5NAM",
  "global-requested-classics-1992-no-me-pises-que-llevo-chanclas-el-canario|El Canario|No Me Pises Que Llevo Chanclas|1992|https://www.youtube.com/watch?v=8OVesjOfsME",
  "global-requested-classics-1972-roberto-carlos-el-gato-que-esta-triste-y-azul|El Gato Que Está Triste y Azul|Roberto Carlos|1972|https://www.youtube.com/watch?v=lEjZQ57E3uE",
  "global-requested-classics-2012-love-of-lesbian-fantastic-shine|Fantastic Shine|Love of Lesbian|2012|https://www.youtube.com/watch?v=WNbW2MOJxcY",
  "global-requested-classics-1988-tracy-chapman-fast-car|Fast Car|Tracy Chapman|1988|https://www.youtube.com/watch?v=AIOAlaACuv4",
  "global-requested-classics-1997-ultra-nate-free|Free|Ultra Naté|1997|https://www.youtube.com/watch?v=JgRBkjgXHro",
  "global-requested-classics-1996-gala-molella-y-phil-jay-freed-from-desire|Freed From Desire|Gala, Molella y Phil Jay|1996|https://www.youtube.com/watch?v=p3l7fgvrEKM",
  "global-requested-classics-1971-t-rex-get-it-on|Get It On|T. Rex|1971|https://www.youtube.com/watch?v=wZkTh_T75QY",
  "global-requested-classics-1979-pecos-hablame-de-ti|Háblame de Ti|Pecos|1979|https://www.youtube.com/watch?v=tJBrK2KAPfc",
  "global-requested-classics-2010-martin-solveig-y-dragonette-hello|Hello|Martin Solveig y Dragonette|2010|https://www.youtube.com/watch?v=kK42LZqO0wA",
  "global-requested-classics-1976-eagles-hotel-california|Hotel California|Eagles|1976|https://www.youtube.com/watch?v=09839DpTctU",
  "global-requested-classics-1982-the-pointer-sisters-i-m-so-excited|I'm So Excited|The Pointer Sisters|1982|https://www.youtube.com/watch?v=8iwBM_YB1sE",
  "global-requested-classics-2003-50-cent-in-da-club|In Da Club|50 Cent|2003|https://www.youtube.com/watch?v=5qm8PH4xAss",
  "global-requested-classics-1996-alanis-morissette-ironic|Ironic|Alanis Morissette|1996|https://www.youtube.com/watch?v=Jne9t8sHpUc",
  "global-requested-classics-1996-eros-ramazzotti-la-cosa-mas-bella|La Cosa Mas Bella|Eros Ramazzotti|1996|https://www.youtube.com/watch?v=UojBaKX5Vz4",
  "global-requested-classics-1981-coz-las-chicas-son-guerreras|Las Chicas Son Guerreras|COZ|1981|https://www.youtube.com/watch?v=4FQg6nvvDl4",
  "global-requested-classics-1970-the-beatles-let-it-be|Let It Be|The Beatles|1970|https://www.youtube.com/watch?v=CGj85pVzRJs",
  "global-requested-classics-1988-los-rebeldes-mediterraneo|Mediterraneo|Los Rebeldes|1988|https://www.youtube.com/watch?v=xG_z6AOkh8A",
  "global-requested-classics-1992-rosario-mi-gato|Mi Gato|Rosario|1992|https://www.youtube.com/watch?v=2F3GlAiboVs",
  "global-requested-classics-1993-m-people-moving-on-up|Moving on Up|M People|1993|https://www.youtube.com/watch?v=zkHOVJINRD8",
  "global-requested-classics-1993-culture-beat-mr-vain|Mr. Vain|Culture Beat|1993|https://www.youtube.com/watch?v=ZMtf_ouMTHw",
  "global-requested-classics-2001-sophie-ellis-bextor-murder-on-the-dancefloor|Murder On The Dancefloor|Sophie Ellis-Bextor|2001|https://www.youtube.com/watch?v=hAx6mYeC6pY",
  "global-requested-classics-1982-madness-our-house|Our House|Madness|1982|https://www.youtube.com/watch?v=KwIe_sjKeAY",
  "global-requested-classics-1998-gloria-estefan-oye|Oye|Gloria Estefan|1998|https://www.youtube.com/watch?v=0TqCJR-1vEg",
  "global-requested-classics-1985-stevie-wonder-part-time-lover|Part-Time Lover|Stevie Wonder|1985|https://www.youtube.com/watch?v=74mL5f7tr5w",
  "global-requested-classics-2021-farruko-pepas|Pepas|Farruko|2021|https://www.youtube.com/watch?v=y8trd3gjJt0",
  "global-requested-classics-1988-fairground-attraction-perfect|Perfect|Fairground Attraction|1988|https://www.youtube.com/watch?v=txapREGWHp0",
  "global-requested-classics-2012-jose-de-rico-y-henry-mendez-rayos-de-sol|Rayos de Sol|José de Rico y Henry Mendez|2012|https://www.youtube.com/watch?v=SVjs5DYDWt0",
  "global-requested-classics-1974-hues-corporation-rock-the-boat|Rock the Boat|Hues Corporation|1974|https://www.youtube.com/watch?v=iKr9wZpjBqE",
  "global-requested-classics-1985-luz-casal-rufino|Rufino|Luz Casal|1985|https://www.youtube.com/watch?v=khxtSG6jNvI",
  "global-requested-classics-2002-benny-benassi-y-the-biz-satisfaction|Satisfaction|Benny Benassi y The Biz|2002|https://www.youtube.com/watch?v=a0fkNdPiIL4",
  "global-requested-classics-2020-jawsh-685-y-jason-derulo-savage-love|Savage Love|Jawsh 685 y Jason Derulo|2020|https://www.youtube.com/watch?v=gUci-tsiU4I",
  "global-requested-classics-1994-scatman-john-scatman|Scatman|Scatman John|1994|https://www.youtube.com/watch?v=Hy8kmNEo1i8",
  "global-requested-classics-1989-isabel-pantoja-se-me-enamora-el-alma|Se Me Enamora el Alma|Isabel Pantoja|1989|https://www.youtube.com/watch?v=BfXp7gIUjAw",
  "global-requested-classics-1994-the-offspring-self-esteem|Self Esteem|The Offspring|1994|https://www.youtube.com/watch?v=Abrn8aVQ76Q",
  "global-requested-classics-2016-leiva-sincericidio|Sincericidio|Leiva|2016|https://www.youtube.com/watch?v=q808C7Lawmo",
  "global-requested-classics-1994-roxette-sleeping-in-my-car|Sleeping In My Car|Roxette|1994|https://www.youtube.com/watch?v=S5fn1DfqPfA",
  "global-requested-classics-1990-ole-ole-sola-con-un-desconocido|Sola (Con un desconocido)|Ole Ole|1990|https://www.youtube.com/watch?v=WmkzVZQuPP4",
  "global-requested-classics-2017-bombai-y-bebe-solo-si-es-contigo|Solo Si Es Contigo|Bombai y Bebe|2017|https://www.youtube.com/watch?v=NMVBQ6C4iNA",
  "global-requested-classics-2003-andy-and-lucas-son-de-amores|Son de Amores|Andy & Lucas|2003|https://www.youtube.com/watch?v=n-zHCwxtpec",
  "global-requested-classics-1997-blur-song-2|Song 2|Blur|1997|https://www.youtube.com/watch?v=SSbBvKaM6sk",
  "global-requested-classics-2015-bomba-estereo-soy-yo|Soy Yo|Bomba Estéreo|2015|https://www.youtube.com/watch?v=bxWxXncl53U",
  "global-requested-classics-1972-david-bowie-starman|Starman|David Bowie|1972|https://www.youtube.com/watch?v=t365MuktYQs",
  "global-requested-classics-2021-the-kid-laroi-y-justin-bieber-stay|STAY|The Kid LAROI y Justin Bieber|2021|https://www.youtube.com/watch?v=kTJczUoc26U",
  "global-requested-classics-1990-new-kids-on-the-block-step-by-step|Step by Step|New Kids On The Block|1990|https://www.youtube.com/watch?v=VbxJv8MGCbc",
  "global-requested-classics-1993-luis-miguel-suave|Suave|Luis Miguel|1993|https://www.youtube.com/watch?v=ksoI-1X9sr4",
  "global-requested-classics-2019-jonas-brothers-sucker|Sucker|Jonas Brothers|2019|https://www.youtube.com/watch?v=CnAmeh0-E-U",
  "global-requested-classics-1988-hombres-g-sueltate-el-pelo|Suéltate el pelo|Hombres G|1988|https://www.youtube.com/watch?v=l5OwnkDfHwI",
  "global-requested-classics-1985-a-ha-take-on-me|Take on Me|a-ha|1985|https://www.youtube.com/watch?v=djV11Xbc914",
  "global-requested-classics-2018-rudimental-y-jess-glynne-these-days|These Days|Rudimental y Jess Glynne|2018|https://www.youtube.com/watch?v=pjTj-_55WZ8",
  "global-requested-classics-1990-mc-hammer-u-can-t-touch-this|U Can't Touch This|MC Hammer|1990|https://www.youtube.com/watch?v=otCpCn0l4Wo",
  "global-requested-classics-1996-toni-braxton-un-break-my-heart|Un-Break My Heart|Toni Braxton|1996|https://www.youtube.com/watch?v=p2Rch6WvPJE",
  "global-requested-classics-2004-natasha-bedingfield-unwritten|Unwritten|Natasha Bedingfield|2004|https://www.youtube.com/watch?v=b7k0a5hYnSI",
  "global-requested-classics-2004-u2-vertigo|Vertigo|U2|2004|https://www.youtube.com/watch?v=98W9QuMq-2k",
  "global-requested-classics-1980-orquesta-mondragon-viaje-con-nosotros|Viaje con nosotros|Orquesta Mondragon|1980|https://www.youtube.com/watch?v=A6q86Q9f8eg",
] as const;

const GLOBAL_REQUESTED_POP_DANCE_PACK_ID = "global-requested-pop-dance-2026-08-15";

const GLOBAL_REQUESTED_POP_DANCE_PACK_ROWS = [
  "global-requested-pop-dance-2016-justin-timberlake-can-t-stop-the-feeling|CAN'T STOP THE FEELING!|Justin Timberlake|2016|https://www.youtube.com/watch?v=ru0K8uYEZWw",
  "global-requested-pop-dance-2019-nil-moliner-mi-religion|Mi Religión|Nil Moliner|2019|https://www.youtube.com/watch?v=fUN_G-zeJB8",
  "global-requested-pop-dance-2000-anastacia-i-m-outta-love|I'm Outta Love|Anastacia|2000|https://www.youtube.com/watch?v=TnOy6HEf7HU",
  "global-requested-pop-dance-2015-ricky-martin-y-yotuel-la-mordidita|La Mordidita|Ricky Martin y Yotuel|2015|https://www.youtube.com/watch?v=lBztnahrOFw",
  "global-requested-pop-dance-1975-kc-y-the-sunshine-band-that-s-the-way-i-like-it|That's the Way (I Like It)|KC & The Sunshine Band|1975|https://www.youtube.com/watch?v=O0_H3F84Yjk",
  "global-requested-pop-dance-1986-the-communards-y-sarah-jane-morris-don-t-leave-me-this-way|Don't Leave Me This Way|The Communards y Sarah Jane Morris|1986|https://www.youtube.com/watch?v=1RHBAd5YUR8",
  "global-requested-pop-dance-1984-prince-purple-rain|Purple Rain|Prince|1984|https://www.youtube.com/watch?v=TvnYmWpD_T8",
  "global-requested-pop-dance-1965-luis-aguile-la-vida-pasa-felizmente|La vida pasa felizmente|Luis Aguile|1965|https://www.youtube.com/watch?v=JGMQzofbMGc",
  "global-requested-pop-dance-2012-will-i-am-y-britney-spears-scream-y-shout|Scream & Shout|will.i.am y Britney Spears|2012|https://www.youtube.com/watch?v=kYtGl1dX5qI",
  "global-requested-pop-dance-1983-ryan-paris-dolce-vita|Dolce Vita|Ryan Paris|1983|https://www.youtube.com/watch?v=EXmABxvHTG4",
  "global-requested-pop-dance-1983-lionel-richie-all-night-long-all-night|All Night Long (All Night)|Lionel Richie|1983|https://www.youtube.com/watch?v=nqAvFx3NxUM",
  "global-requested-pop-dance-1993-proyecto-uno-tiburon|Tiburon|Proyecto Uno|1993|https://www.youtube.com/watch?v=4Qy0vs80T5M",
  "global-requested-pop-dance-1980-pedro-marin-aire|Aire|Pedro Marin|1980|https://www.youtube.com/watch?v=GrPRnesaK_U",
  "global-requested-pop-dance-2015-felix-jaehn-y-jasmine-thompson-ain-t-nobody-loves-me-better|Ain't Nobody (Loves Me Better)|Felix Jaehn y Jasmine Thompson|2015|https://www.youtube.com/watch?v=5j1RCys4R0g",
  "global-requested-pop-dance-2000-robbie-williams-rock-dj|Rock DJ|Robbie Williams|2000|https://www.youtube.com/watch?v=BnO3nijfYmU",
  "global-requested-pop-dance-2004-james-blunt-you-re-beautiful|You're Beautiful|James Blunt|2004|https://www.youtube.com/watch?v=oofSnsGkops",
  "global-requested-pop-dance-2009-black-eyed-peas-i-gotta-feeling|I Gotta Feeling|Black Eyed Peas|2009|https://www.youtube.com/watch?v=uSD4vsh1zDA",
  "global-requested-pop-dance-1978-village-people-ymca|YMCA|Village People|1978|https://www.youtube.com/watch?v=CS9OO0S5w2k",
  "global-requested-pop-dance-1996-rebeca-duro-de-pelar|Duro De Pelar|Rebeca|1996|https://www.youtube.com/watch?v=FUJUubrz3Xo",
  "global-requested-pop-dance-1977-micky-ensename-a-cantar|Enseñame a Cantar|Micky|1977|https://www.youtube.com/watch?v=HO6zj2JZ0kA",
  "global-requested-pop-dance-1999-jennifer-lopez-una-noche-mas|Una Noche Más|Jennifer Lopez|1999|https://www.youtube.com/watch?v=OeTzr7gqBDo",
  "global-requested-pop-dance-2002-avril-lavigne-complicated|Complicated|Avril Lavigne|2002|https://www.youtube.com/watch?v=5NPBIwQyPWE",
  "global-requested-pop-dance-1980-orchestral-manoeuvres-in-the-dark-enola-gay|Enola Gay|Orchestral Manoeuvres In The Dark|1980|https://www.youtube.com/watch?v=d5XJ2GiR6Bo",
  "global-requested-pop-dance-2002-david-civera-que-la-detengan|Que La Detengan|David Civera|2002|https://www.youtube.com/watch?v=kDZYp4MJL0E",
  "global-requested-pop-dance-2020-24kgoldn-y-iann-dior-mood|Mood|24kGoldn y iann dior|2020|https://www.youtube.com/watch?v=GrAchTdepsU",
  "global-requested-pop-dance-2005-the-pussycat-dolls-y-busta-rhymes-don-t-cha|Don't Cha|The Pussycat Dolls y Busta Rhymes|2005|https://www.youtube.com/watch?v=YNSxNsr4wmA",
  "global-requested-pop-dance-1988-robert-palmer-simply-irresistible|Simply Irresistible|Robert Palmer|1988|https://www.youtube.com/watch?v=SoHpSY3IoAI",
  "global-requested-pop-dance-2005-bodyrockers-i-like-the-way|I Like The Way|BodyRockers|2005|https://www.youtube.com/watch?v=jO90ullM3FQ",
  "global-requested-pop-dance-1986-duncan-dhu-cien-gaviotas|Cien gaviotas|Duncan Dhu|1986|https://www.youtube.com/watch?v=htzljEZv7P4",
  "global-requested-pop-dance-2022-bizarrap-y-quevedo-quevedo-bzrp-music-sessions-vol-52|Quevedo: Bzrp Music Sessions, Vol. 52|Bizarrap y Quevedo|2022|https://www.youtube.com/watch?v=A_g3lMcWVy0",
  "global-requested-pop-dance-2007-leona-lewis-bleeding-love|Bleeding Love|Leona Lewis|2007|https://www.youtube.com/watch?v=Vzo-EL_62fQ",
  "global-requested-pop-dance-2017-becky-g-y-bad-bunny-mayores|Mayores|Becky G y Bad Bunny|2017|https://www.youtube.com/watch?v=GMFewiplIbw",
  "global-requested-pop-dance-1997-nek-laura-no-esta|Laura no està|Nek|1997|https://www.youtube.com/watch?v=DAIxrSvq6bo",
  "global-requested-pop-dance-2000-thalia-arrasando|Arrasando|Thalia|2000|https://www.youtube.com/watch?v=Fn1h3AQk_TQ",
  "global-requested-pop-dance-1992-inner-circle-sweat-a-la-la-la-la-long|Sweat (A La La La La Long)|Inner Circle|1992|https://www.youtube.com/watch?v=uc2UEfWjvo8",
  "global-requested-pop-dance-1990-juan-luis-guerra-4-40-la-bilirrubina|La Bilirrubina|Juan Luis Guerra 4.40|1990|https://www.youtube.com/watch?v=McV4pBRb-Sg",
  "global-requested-pop-dance-1991-chimo-bayo-asi-me-gusta-a-mi|Asi Me Gusta a Mi|Chimo Bayo|1991|https://www.youtube.com/watch?v=6RfWHSfYriI",
  "global-requested-pop-dance-1992-los-manolos-amigos-para-siempre|Amigos para Siempre|Los Manolos|1992|https://www.youtube.com/watch?v=U_VcW5XAedE",
  "global-requested-pop-dance-1975-abba-mamma-mia|Mamma Mia|ABBA|1975|https://www.youtube.com/watch?v=unfzfe8f9NI",
  "global-requested-pop-dance-1997-meredith-brooks-bitch|Bitch|Meredith Brooks|1997|https://www.youtube.com/watch?v=_ivt_N2Zcts",
  "global-requested-pop-dance-1987-sabrina-boys-summertime-love|Boys - Summertime Love|Sabrina|1987|https://www.youtube.com/watch?v=_hu1nKEWyZM",
  "global-requested-pop-dance-1984-la-union-lobo-hombre-en-paris|Lobo-hombre en París|La Unión|1984|https://www.youtube.com/watch?v=IhnOpwOMHgk",
  "global-requested-pop-dance-1983-cyndi-lauper-girls-just-want-to-have-fun|Girls Just Want to Have Fun|Cyndi Lauper|1983|https://www.youtube.com/watch?v=PIb6AZdTr-A",
  "global-requested-pop-dance-1986-desireless-voyage-voyage|Voyage voyage|Desireless|1986|https://www.youtube.com/watch?v=NlgmH5q9uNk",
  "global-requested-pop-dance-1990-nick-kamen-i-promised-myself|I Promised Myself|Nick Kamen|1990|https://www.youtube.com/watch?v=xpq5kSxw0ns",
  "global-requested-pop-dance-2018-pedro-capo-y-farruko-calma|Calma|Pedro Capó y Farruko|2018|https://www.youtube.com/watch?v=8EFalFXALEA",
  "global-requested-pop-dance-2011-fun-y-janelle-monae-we-are-young|We Are Young|fun. y Janelle Monáe|2011|https://www.youtube.com/watch?v=Sv6dMFF_yts",
  "global-requested-pop-dance-1991-crystal-waters-y-the-basement-boys-gypsy-woman-she-s-homeless|Gypsy Woman (She's Homeless)|Crystal Waters y The Basement Boys|1991|https://www.youtube.com/watch?v=NqThf-MpCjs",
  "global-requested-pop-dance-1994-ini-kamoze-here-comes-the-hotstepper|Here Comes the Hotstepper|Ini Kamoze|1994|https://www.youtube.com/watch?v=HiNke_YplfY",
  "global-requested-pop-dance-1985-miami-sound-machine-y-gloria-estefan-conga|Conga!|Miami Sound Machine y Gloria Estefan|1985|https://www.youtube.com/watch?v=54ItEmCnP80",
  "global-requested-pop-dance-2008-kate-ryan-ella-elle-l-a|Ella Elle L A|Kate Ryan|2008|https://www.youtube.com/watch?v=Oqd9lzMP1V8",
  "global-requested-pop-dance-1987-pet-shop-boys-it-s-a-sin|It's a Sin|Pet Shop Boys|1987|https://www.youtube.com/watch?v=dRHetRTOD1Q",
  "global-requested-pop-dance-2006-dover-let-me-out|Let Me Out|Dover|2006|https://www.youtube.com/watch?v=DAznFZc67bM",
  "global-requested-pop-dance-2001-sonia-y-selena-yo-quiero-bailar|Yo Quiero Bailar|Sonia Y Selena|2001|https://www.youtube.com/watch?v=EjkPV2jFw8g",
  "global-requested-pop-dance-2007-sean-kingston-beautiful-girls|Beautiful Girls|Sean Kingston|2007|https://www.youtube.com/watch?v=MrTz5xjmso4",
  "global-requested-pop-dance-1994-whigfield-saturday-night|Saturday Night|Whigfield|1994|https://www.youtube.com/watch?v=8DNQRtmIMxk",
  "global-requested-pop-dance-2014-chayanne-madre-tierra-oye|Madre Tierra (Oye)|Chayanne|2014|https://www.youtube.com/watch?v=VkuRIZ7QyDM",
  "global-requested-pop-dance-1974-jeanette-porque-te-vas|Porque te vas|Jeanette|1974|https://www.youtube.com/watch?v=TjUhXbGdLYo",
  "global-requested-pop-dance-2021-zzoilo-y-aitana-mon-amour|Mon Amour|Zzoilo y Aitana|2021|https://www.youtube.com/watch?v=YXN7zxjNWSg",
  "global-requested-pop-dance-2014-george-ezra-budapest|Budapest|George Ezra|2014|https://www.youtube.com/watch?v=VHrLPs3_1Fs",
  "global-requested-pop-dance-1996-ella-baila-sola-lo-echamos-a-suertes|Lo echamos a suertes|Ella Baila Sola|1996|https://www.youtube.com/watch?v=stYs4VQBbrE",
  "global-requested-pop-dance-1982-miguel-rios-bienvenidos|Bienvenidos|Miguel Ríos|1982|https://www.youtube.com/watch?v=Rm-yZGvcf2U",
  "global-requested-pop-dance-1979-ana-belen-agapimu|Agapimu|Ana Belén|1979|https://www.youtube.com/watch?v=6BA9-cWsZjs",
  "global-requested-pop-dance-1978-patti-smith-because-the-night|Because the Night|Patti Smith|1978|https://www.youtube.com/watch?v=x_ksSEONVyc",
  "global-requested-pop-dance-1994-green-day-basket-case|Basket Case|Green Day|1994|https://www.youtube.com/watch?v=NUTGr5t3MoY",
  "global-requested-pop-dance-2011-michel-telo-ai-se-eu-te-pego|Ai Se Eu Te Pego|Michel Teló|2011|https://www.youtube.com/watch?v=hcm55lU9knw",
  "global-requested-pop-dance-1971-don-mclean-american-pie|American Pie|Don McLean|1971|https://www.youtube.com/watch?v=PRpiBpDy7MQ",
  "global-requested-pop-dance-1981-stars-on-45-stars-on-45|Stars On 45|Stars On 45|1981|https://www.youtube.com/watch?v=5bGQ1-Gmoso",
  "global-requested-pop-dance-1989-the-b-52-s-love-shack|Love Shack|The B-52's|1989|https://www.youtube.com/watch?v=9SOryJvTAGs",
  "global-requested-pop-dance-2007-yves-larock-rise-up|Rise Up|Yves Larock|2007|https://www.youtube.com/watch?v=zwcmZ0mGQno",
  "global-requested-pop-dance-1997-chumbawamba-tubthumping|Tubthumping|Chumbawamba|1997|https://www.youtube.com/watch?v=2H5uWRjFsGc",
  "global-requested-pop-dance-2021-maneskin-i-wanna-be-your-slave|I WANNA BE YOUR SLAVE|Måneskin|2021|https://www.youtube.com/watch?v=yOb9Xaug35M",
  "global-requested-pop-dance-2000-nsync-bye-bye-bye|Bye Bye Bye|*NSYNC|2000|https://www.youtube.com/watch?v=Eo-KmOd3i7s",
  "global-requested-pop-dance-2003-the-white-stripes-seven-nation-army|Seven Nation Army|The White Stripes|2003|https://www.youtube.com/watch?v=0J2QdDbelmY",
  "global-requested-pop-dance-1991-right-said-fred-i-m-too-sexy|I'm Too Sexy|Right Said Fred|1991|https://www.youtube.com/watch?v=P5mtclwloEQ",
  "global-requested-pop-dance-2005-franz-ferdinand-do-you-want-to|Do You Want To|Franz Ferdinand|2005|https://www.youtube.com/watch?v=1OJRRUnY--A",
  "global-requested-pop-dance-1995-take-that-back-for-good|Back for Good|Take That|1995|https://www.youtube.com/watch?v=N2ICtCO8TCw",
  "global-requested-pop-dance-1993-counting-crows-mr-jones|Mr. Jones|Counting Crows|1993|https://www.youtube.com/watch?v=-oqAU5VxFWs",
  "global-requested-pop-dance-2022-lizzo-about-damn-time|About Damn Time|Lizzo|2022|https://www.youtube.com/watch?v=IXXxciRUMzE",
  "global-requested-pop-dance-1979-donna-summer-hot-stuff|Hot Stuff|Donna Summer|1979|https://www.youtube.com/watch?v=KhcaPNuaJNU",
  "global-requested-pop-dance-2001-jamiroquai-little-l|Little L|Jamiroquai|2001|https://www.youtube.com/watch?v=1hHSH9sJUEo",
  "global-requested-pop-dance-1985-u-s-a-for-africa-we-are-the-world|We Are The World|U.S.A. For Africa|1985|https://www.youtube.com/watch?v=s3wNuru4U0I",
  "global-requested-pop-dance-2005-el-sueno-de-morfeo-nunca-volvera|Nunca volverá|El Sueño de Morfeo|2005|https://www.youtube.com/watch?v=I-uwouMzUB4",
  "global-requested-pop-dance-1984-wham-wake-me-up-before-you-go-go|Wake Me Up Before You Go-Go|Wham!|1984|https://www.youtube.com/watch?v=pIgZ7gMze7A",
] as const;

const GLOBAL_REQUESTED_HITS_PACK_ID = "global-requested-hits-2026-08-15";

const GLOBAL_REQUESTED_HITS_PACK_ROWS = [
  "global-requested-hits-2009-kesha-tik-tok|TiK ToK|Kesha|2009|https://www.youtube.com/watch?v=OF04pKp-r9o",
  "global-requested-hits-1974-los-chichos-ni-mas-ni-menos|Ni Mas Ni Menos|Los Chichos|1974|https://www.youtube.com/watch?v=-OcLz_WY0Ls",
  "global-requested-hits-1989-texas-i-don-t-want-a-lover|I Don't Want A Lover|Texas|1989|https://www.youtube.com/watch?v=KHLchEtMKQg",
  "global-requested-hits-1972-vicente-fernandez-volver-volver|Volver, Volver|Vicente Fernández|1972|https://www.youtube.com/watch?v=ugNQ5uIN09Q",
  "global-requested-hits-1989-technotronic-pump-up-the-jam|Pump Up The Jam|Technotronic|1989|https://www.youtube.com/watch?v=9EcjWd-O4jI",
  "global-requested-hits-1997-backstreet-boys-everybody-backstreet-s-back|Everybody (Backstreet's Back)|Backstreet Boys|1997|https://www.youtube.com/watch?v=6M6samPEMpM",
  "global-requested-hits-2020-ava-max-kings-y-queens|Kings & Queens|Ava Max|2020|https://www.youtube.com/watch?v=jH1RNk8954Q",
  "global-requested-hits-1982-roxy-music-more-than-this|More Than This|Roxy Music|1982|https://www.youtube.com/watch?v=kOnde5c7OG8",
  "global-requested-hits-2010-b-o-b-y-hayley-williams-airplanes|Airplanes|B.o.B y Hayley Williams|2010|https://www.youtube.com/watch?v=kn6-c223DUU",
  "global-requested-hits-2021-doja-cat-y-sza-kiss-me-more|Kiss Me More|Doja Cat y SZA|2021|https://www.youtube.com/watch?v=0EVVKs6DQLo",
  "global-requested-hits-2001-coyote-dax-no-rompas-mi-corazon|No Rompas Mi Corazón|Coyote Dax|2001|https://www.youtube.com/watch?v=Y7u2rE-p8JI",
  "global-requested-hits-1991-obk-historias-de-amor|Historias de amor|OBK|1991|https://www.youtube.com/watch?v=ji-fewF6iOk",
  "global-requested-hits-1971-peret-borriquito|Borriquito|Peret|1971|https://www.youtube.com/watch?v=5nchCNteFm0",
  "global-requested-hits-1971-mari-trini-yo-no-soy-esa|Yo no soy esa|Mari Trini|1971|https://www.youtube.com/watch?v=ay4XUA8JRNY",
  "global-requested-hits-2000-modjo-lady-hear-me-tonight|Lady - Hear Me Tonight|Modjo|2000|https://www.youtube.com/watch?v=mMfxI3r_LyA",
  "global-requested-hits-2008-the-killers-human|Human|The Killers|2008|https://www.youtube.com/watch?v=RIZdjT1472Y",
  "global-requested-hits-1974-the-rubettes-sugar-baby-love|Sugar Baby Love|The Rubettes|1974|https://www.youtube.com/watch?v=HxsNy4NoZUs",
  "global-requested-hits-1984-radio-futura-escuela-de-calor|Escuela de Calor|Radio Futura|1984|https://www.youtube.com/watch?v=LyCQvyrZzW0",
  "global-requested-hits-1996-spice-girls-wannabe|Wannabe|Spice Girls|1996|https://www.youtube.com/watch?v=gJLIiF15wjQ",
  "global-requested-hits-2006-scissor-sisters-i-don-t-feel-like-dancin|I Don't Feel Like Dancin'|Scissor Sisters|2006|https://www.youtube.com/watch?v=4H5I6y1Qvz0",
  "global-requested-hits-2003-carlinhos-brown-y-dj-dero-maria-caipirinha|María Caipirinha|Carlinhos Brown y DJ Dero|2003|https://www.youtube.com/watch?v=-9Q9tG1T1js",
  "global-requested-hits-1987-george-michael-faith|Faith|George Michael|1987|https://www.youtube.com/watch?v=6Cs3Pvmmv0E",
  "global-requested-hits-1998-eiffel-65-y-gabry-ponte-blue-da-ba-dee|Blue (Da Ba Dee)|Eiffel 65 y Gabry Ponte|1998|https://www.youtube.com/watch?v=68ugkg9RePc",
  "global-requested-hits-1997-will-smith-gettin-jiggy-wit-it|Gettin' Jiggy Wit It|Will Smith|1997|https://www.youtube.com/watch?v=-sOPCY6_If8",
  "global-requested-hits-2007-conchita-nada-que-perder|Nada Que Perder|Conchita|2007|https://www.youtube.com/watch?v=GXBXpccCMMk",
  "global-requested-hits-1973-the-rolling-stones-angie|Angie|The Rolling Stones|1973|https://www.youtube.com/watch?v=RcZn2-bGXqQ",
  "global-requested-hits-2011-juan-magan-bailando-por-ahi|Bailando por Ahi|Juan Magán|2011|https://www.youtube.com/watch?v=9m6ogS57sc8",
  "global-requested-hits-2020-bts-dynamite|Dynamite|BTS|2020|https://www.youtube.com/watch?v=OiMWFojB9Ok",
  "global-requested-hits-1976-sandro-giacobbe-el-jardin-prohibido|El Jardín Prohibido|Sandro Giacobbe|1976|https://www.youtube.com/watch?v=kbkhLRqLTrw",
  "global-requested-hits-2020-camilo-vida-de-rico|Vida de Rico|Camilo|2020|https://www.youtube.com/watch?v=qKp1f7Vn9dM",
  "global-requested-hits-1993-aerosmith-cryin|Cryin'|Aerosmith|1993|https://www.youtube.com/watch?v=qfNmyxV2Ncw",
  "global-requested-hits-2010-alexandra-stan-mr-saxobeat|Mr. Saxobeat|Alexandra Stan|2010|https://www.youtube.com/watch?v=nwsewSMWIas",
  "global-requested-hits-2016-jonas-blue-y-jp-cooper-perfect-strangers|Perfect Strangers|Jonas Blue y JP Cooper|2016|https://www.youtube.com/watch?v=Ey_hgKCCYU4",
  "global-requested-hits-2021-rauw-alejandro-todo-de-ti|Todo De Ti|Rauw Alejandro|2021|https://www.youtube.com/watch?v=CFPLIaMpGrY",
  "global-requested-hits-1982-survivor-eye-of-the-tiger|Eye of the Tiger|Survivor|1982|https://www.youtube.com/watch?v=btPJPFnesV4",
  "global-requested-hits-1998-the-corrs-y-tin-tin-out-what-can-i-do|What Can I Do|The Corrs y Tin Tin Out|1998|https://www.youtube.com/watch?v=4Bs6CGe85aY",
  "global-requested-hits-1995-michael-jackson-y-janet-jackson-scream|Scream|Michael Jackson y Janet Jackson|1995|https://www.youtube.com/watch?v=0P4A1K4lXDo",
  "global-requested-hits-2002-christina-aguilera-beautiful|Beautiful|Christina Aguilera|2002|https://www.youtube.com/watch?v=eAfyFTzZDMM",
  "global-requested-hits-1980-queen-another-one-bites-the-dust|Another One Bites The Dust|Queen|1980|https://www.youtube.com/watch?v=rY0WxgSXdEE",
  "global-requested-hits-1970-christie-yellow-river|Yellow River|Christie|1970|https://www.youtube.com/watch?v=aqUYPgYcgDQ",
  "global-requested-hits-2006-gnarls-barkley-y-ceelo-green-crazy|Crazy|Gnarls Barkley y CeeLo Green|2006|https://www.youtube.com/watch?v=-N4jf6rtyuw",
  "global-requested-hits-1984-bonnie-tyler-holding-out-for-a-hero|Holding Out for a Hero|Bonnie Tyler|1984|https://www.youtube.com/watch?v=bWcASV2sey0",
  "global-requested-hits-2000-eminem-y-dido-stan|Stan|Eminem y Dido|2000|https://www.youtube.com/watch?v=gOMhN-hfMtY",
  "global-requested-hits-2009-la-quinta-estacion-que-te-queria|Que Te Quería|La Quinta Estacion|2009|https://www.youtube.com/watch?v=JPdm1AskDfc",
  "global-requested-hits-1999-tlc-no-scrubs|No Scrubs|TLC|1999|https://www.youtube.com/watch?v=FrLequ6dUdM",
  "global-requested-hits-1999-cafe-quijano-la-lola|La Lola|Café Quijano|1999|https://www.youtube.com/watch?v=ccsUjRhpo_U",
  "global-requested-hits-2009-pitbull-i-know-you-want-me-calle-ocho|I Know You Want Me (Calle Ocho)|Pitbull|2009|https://www.youtube.com/watch?v=E2tMV96xULk",
  "global-requested-hits-1981-depeche-mode-just-can-t-get-enough|Just Can't Get Enough|Depeche Mode|1981|https://www.youtube.com/watch?v=_6FBfAQ-NDE",
  "global-requested-hits-2014-sia-chandelier|Chandelier|Sia|2014|https://www.youtube.com/watch?v=2vjPBrBU-TM",
  "global-requested-hits-2004-gwen-stefani-what-you-waiting-for|What You Waiting For?|Gwen Stefani|2004|https://www.youtube.com/watch?v=f5qICl3Fr3w",
  "global-requested-hits-1991-celtas-cortos-cuentame-un-cuento|Cuéntame un cuento|Celtas Cortos|1991|https://www.youtube.com/watch?v=MM9zHF4e810",
  "global-requested-hits-1978-rod-stewart-da-ya-think-i-m-sexy|Da Ya Think I'm Sexy?|Rod Stewart|1978|https://www.youtube.com/watch?v=Hphwfq1wLJs",
  "global-requested-hits-2015-ellie-goulding-love-me-like-you-do|Love Me Like You Do|Ellie Goulding|2015|https://www.youtube.com/watch?v=AJtDXIazrMo",
  "global-requested-hits-2003-black-eyed-peas-where-is-the-love|Where Is The Love?|Black Eyed Peas|2003|https://www.youtube.com/watch?v=WpYeekQkAdc",
  "global-requested-hits-1982-the-weather-girls-it-s-raining-men|It's Raining Men|The Weather Girls|1982|https://www.youtube.com/watch?v=l5aZJBLAu1E",
  "global-requested-hits-1998-fatboy-slim-the-rockafeller-skank|The Rockafeller Skank|Fatboy Slim|1998|https://www.youtube.com/watch?v=FMrIy9zm7QY",
  "global-requested-hits-2010-taio-cruz-dynamite|Dynamite|Taio Cruz|2010|https://www.youtube.com/watch?v=VUjdiDeJ0xg",
  "global-requested-hits-1987-belinda-carlisle-heaven-is-a-place-on-earth|Heaven Is A Place On Earth|Belinda Carlisle|1987|https://www.youtube.com/watch?v=j2F4INQFjEI",
  "global-requested-hits-1999-the-chemical-brothers-hey-boy-hey-girl|Hey Boy Hey Girl|The Chemical Brothers|1999|https://www.youtube.com/watch?v=tpKCqp9CALQ",
  "global-requested-hits-1974-george-mccrae-rock-your-baby|Rock Your Baby|George McCrae|1974|https://www.youtube.com/watch?v=gutE8I0Tk3E",
  "global-requested-hits-1977-john-paul-young-love-is-in-the-air|Love Is In The Air|John Paul Young|1977|https://www.youtube.com/watch?v=TInrBuCcuFY",
  "global-requested-hits-2012-flo-rida-whistle|Whistle|Flo Rida|2012|https://www.youtube.com/watch?v=cSnkWzZ7ZAA",
  "global-requested-hits-2016-charlie-puth-y-selena-gomez-we-don-t-talk-anymore|We Don't Talk Anymore|Charlie Puth y Selena Gomez|2016|https://www.youtube.com/watch?v=3AtDnEC4zak",
  "global-requested-hits-1984-alphaville-forever-young|Forever Young|Alphaville|1984|https://www.youtube.com/watch?v=oNjQXmoxiQ8",
  "global-requested-hits-1990-snap-the-power|The Power|SNAP!|1990|https://www.youtube.com/watch?v=nm6DO_7px1I",
  "global-requested-hits-1989-loco-mia-locomia|Locomia|Loco Mía|1989|https://www.youtube.com/watch?v=cJFaSkqdBPI",
  "global-requested-hits-1992-house-of-pain-jump-around|Jump Around|House Of Pain|1992|https://www.youtube.com/watch?v=jrL_LzX5wv4",
  "global-requested-hits-2001-chocolate-mayonesa|Mayonesa|Chocolate|2001|https://www.youtube.com/watch?v=T6NhuWYnxW0",
  "global-requested-hits-2007-los-ronaldos-no-puedo-vivir-sin-ti|No Puedo Vivir Sin Ti|Los Ronaldos|2007|https://www.youtube.com/watch?v=BBGfHp1-zl4",
  "global-requested-hits-1973-nino-bravo-america-america|América, América|Nino Bravo|1973|https://www.youtube.com/watch?v=7sUvASlQiAM",
  "global-requested-hits-2007-juanes-me-enamora|Me Enamora|Juanes|2007|https://www.youtube.com/watch?v=voxgN3Dhjuo",
  "global-requested-hits-2009-edward-maya-y-vika-jigulina-stereo-love|Stereo Love|Edward Maya y Vika Jigulina|2009|https://www.youtube.com/watch?v=p-Z3YrHJ1sU",
  "global-requested-hits-1976-elton-john-y-kiki-dee-don-t-go-breaking-my-heart|Don't Go Breaking My Heart|Elton John y Kiki Dee|1976|https://www.youtube.com/watch?v=z0qW9P-uYfM",
  "global-requested-hits-2017-portugal-the-man-feel-it-still|Feel It Still|Portugal. The Man|2017|https://www.youtube.com/watch?v=pBkHHoOIIn8",
  "global-requested-hits-2006-moby-y-amaral-escapar-slipping-away|Escapar (Slipping Away)|Moby y Amaral|2006|https://www.youtube.com/watch?v=HvxVMvbKnbY",
] as const;

const GLOBAL_SPANISH_REQUESTED_HITS_PACK_ID = "global-spanish-requested-hits-2026-08-15";

const GLOBAL_SPANISH_REQUESTED_HITS_PACK_ROWS = [
  "global-spanish-requested-1996-extremoduro-so-payaso|So Payaso|Extremoduro|1996|https://www.youtube.com/watch?v=1D3tSv9LQlE",
  "global-spanish-requested-1992-platero-y-tu-el-roce-de-tu-cuerpo|El Roce de tu Cuerpo|Platero y Tú|1992|https://www.youtube.com/watch?v=oApqXiCbqjo",
  "global-spanish-requested-1989-loquillo-cadillac-solitario|Cadillac Solitario|Loquillo|1989|https://www.youtube.com/watch?v=vvitGvSA1EI",
  "global-spanish-requested-1980-los-secretos-dejame|Déjame|Los Secretos|1980|https://www.youtube.com/watch?v=G8yKzRSpT2s",
  "global-spanish-requested-1980-nacha-pop-chica-de-ayer|Chica de Ayer|Nacha Pop|1980|https://www.youtube.com/watch?v=oAcwJlNdwso",
  "global-spanish-requested-1991-seguridad-social-chiquilla|Chiquilla|Seguridad Social|1991|https://www.youtube.com/watch?v=-d3mZmP_me4",
  "global-spanish-requested-1981-tequila-salta|Salta|Tequila|1981|https://www.youtube.com/watch?v=6IPL5C3eaBY",
  "global-spanish-requested-1993-los-rodriguez-sin-documentos|Sin Documentos|Los Rodríguez|1993|https://www.youtube.com/watch?v=BUKHMGiW_rY",
  "global-spanish-requested-1997-andres-calamaro-flaca|Flaca|Andrés Calamaro|1997|https://www.youtube.com/watch?v=UCF9oHXhDMU",
  "global-spanish-requested-1991-celtas-cortos-20-de-abril|20 de Abril|Celtas Cortos|1991|https://www.youtube.com/watch?v=sMvPN3349og",
  "global-spanish-requested-2001-marea-el-perro-verde|El Perro Verde|Marea|2001|https://www.youtube.com/watch?v=0KAp64XJHPY",
  "global-spanish-requested-2016-alvaro-soler-sofia|Sofía|Álvaro Soler|2016|https://www.youtube.com/watch?v=qaZ0oAh4evU",
  "global-spanish-requested-2015-gente-de-zona-y-marc-anthony-la-gozadera|La Gozadera|Gente de Zona y Marc Anthony|2015|https://www.youtube.com/watch?v=VMp55KH_3wo",
  "global-spanish-requested-2015-nicky-jam-y-enrique-iglesias-el-perdon|El Perdón|Nicky Jam y Enrique Iglesias|2015|https://www.youtube.com/watch?v=hXI8RQYC36Q",
  "global-spanish-requested-2010-don-omar-y-lucenzo-danza-kuduro|Danza Kuduro|Don Omar y Lucenzo|2010|https://www.youtube.com/watch?v=71sqkgaUncI",
  "global-spanish-requested-2018-aitana-vas-a-quedarte|Vas A Quedarte|Aitana|2018|https://www.youtube.com/watch?v=e8vI0pYLcYU",
  "global-spanish-requested-2009-macaco-moving|Moving|Macaco|2009|https://www.youtube.com/watch?v=65qyXoiSGSI",
  "global-spanish-requested-2009-efecto-mariposa-por-quererte|Por Quererte|Efecto Mariposa|2009|https://www.youtube.com/watch?v=15bvHHXOFBI",
  "global-spanish-requested-2006-pignoise-te-entiendo|Te Entiendo|Pignoise|2006|https://www.youtube.com/watch?v=hF63M25AxTg",
  "global-spanish-requested-2001-m-clan-carolina|Carolina|M-Clan|2001|https://www.youtube.com/watch?v=hEKJnaHwihw",
  "global-spanish-requested-2009-zenttric-solo-quiero-bailar|Solo Quiero Bailar|Zenttric|2009|https://www.youtube.com/watch?v=kSRK8nrc4Io",
  "global-spanish-requested-2011-la-pegatina-mari-carmen|Mari Carmen|La Pegatina|2011|https://www.youtube.com/watch?v=NFSyl3pwa-A",
  "global-spanish-requested-1978-camilo-sesto-vivir-asi-es-morir-de-amor|Vivir Así es Morir de Amor|Camilo Sesto|1978|https://www.youtube.com/watch?v=0xyfnlWs9QA",
  "global-spanish-requested-1967-raphael-mi-gran-noche|Mi Gran Noche|Raphael|1967|https://www.youtube.com/watch?v=lJNtNOC81oA",
  "global-spanish-requested-1978-julio-iglesias-me-olvide-de-vivir|Me Olvidé de Vivir|Julio Iglesias|1978|https://www.youtube.com/watch?v=o7LkZhKeY_o",
  "global-spanish-requested-1981-rocio-jurado-como-una-ola|Como una Ola|Rocío Jurado|1981|https://www.youtube.com/watch?v=ClC42sfrglc",
  "global-spanish-requested-1979-jose-luis-perales-un-velero-llamado-libertad|Un Velero Llamado Libertad|José Luis Perales|1979|https://www.youtube.com/watch?v=EFL1NdCDdlM",
  "global-spanish-requested-1970-los-diablos-un-rayo-de-sol|Un Rayo de Sol|Los Diablos|1970|https://www.youtube.com/watch?v=o8JfMVLct9g",
  "global-spanish-requested-1973-formula-v-eva-maria|Eva María|Fórmula V|1973|https://www.youtube.com/watch?v=OuL6Yt0k1CE",
  "global-spanish-requested-1975-cecilia-un-ramito-de-violetas|Un Ramito de Violetas|Cecilia|1975|https://www.youtube.com/watch?v=8AtSHZTwehY",
  "global-spanish-requested-1980-antonio-flores-no-dudaria|No Dudaria|Antonio Flores|1980|https://www.youtube.com/watch?v=F_xbfIgWMHU",
  "global-spanish-requested-1993-ketama-no-estamos-locos|No Estamos Locos|Ketama|1993|https://www.youtube.com/watch?v=lsjx_z7EjBc",
  "global-spanish-requested-2002-david-bustamante-y-alex-casademunt-dos-hombres-y-un-destino|Dos Hombres y un Destino|David Bustamante y Alex Casademunt|2002|https://www.youtube.com/watch?v=aD1c637N-i0",
  "global-spanish-requested-2012-pastora-soler-quedate-conmigo|Quédate Conmigo|Pastora Soler|2012|https://www.youtube.com/watch?v=W7y1pvW60ng",
  "global-spanish-requested-2000-monica-naranjo-sobrevivire|Sobreviviré|Mónica Naranjo|2000|https://www.youtube.com/watch?v=xErS7G3-tCQ",
  "global-spanish-requested-1993-marta-sanchez-desesperada|Desesperada|Marta Sánchez|1993|https://www.youtube.com/watch?v=d3fXmjU3DSY",
  "global-spanish-requested-1991-amistades-peligrosas-estoy-por-ti|Estoy por Ti|Amistades Peligrosas|1991|https://www.youtube.com/watch?v=YVU3Kvrlg5Y",
  "global-spanish-requested-1990-complices-es-por-ti|Es Por Ti|Cómplices|1990|https://www.youtube.com/watch?v=Cfk_7Z4Uktk",
  "global-spanish-requested-1991-presuntos-implicados-como-hemos-cambiado|Cómo Hemos Cambiado|Presuntos Implicados|1991|https://www.youtube.com/watch?v=iQvom61kCTg",
  "global-spanish-requested-1996-azucar-moreno-solo-se-vive-una-vez|Solo Se Vive una Vez|Azúcar Moreno|1996|https://www.youtube.com/watch?v=LxrUkFQHYpg",
  "global-spanish-requested-2000-king-africa-la-bomba|La Bomba|King África|2000|https://www.youtube.com/watch?v=kRslNQgxKR4",
  "global-spanish-requested-1994-georgie-dann-la-barbacoa|La Barbacoa|Georgie Dann|1994|https://www.youtube.com/watch?v=lTxGto9ADx0",
  "global-spanish-requested-1992-zapato-veloz-tractor-amarillo|Tractor Amarillo|Zapato Veloz|1992|https://www.youtube.com/watch?v=62Z8vUIk9s8",
  "global-spanish-requested-1998-mojinos-escozios-que-gueno-que-estoy|Qué Güeno Que Estoy|Mojinos Escozios|1998|https://www.youtube.com/watch?v=YtGM-9Z2bKQ",
  "global-spanish-requested-1996-ska-p-cannabis|Cannabis|Ska-P|1996|https://www.youtube.com/watch?v=FvmAk7mXtUY",
  "global-spanish-requested-2000-mago-de-oz-fiesta-pagana|Fiesta Pagana|Mago de Oz|2000|https://www.youtube.com/watch?v=xvVLWSsKjkI",
  "global-spanish-requested-1981-rocio-durcal-la-gata-bajo-la-lluvia|La Gata Bajo la Lluvia|Rocío Dúrcal|1981|https://www.youtube.com/watch?v=acl81DrzYP8",
  "global-spanish-requested-2006-gloria-trevi-todos-me-miran|Todos Me Miran|Gloria Trevi|2006|https://www.youtube.com/watch?v=MsAAbvwsvK4",
  "global-spanish-requested-2000-paulina-rubio-y-yo-sigo-aqui|Y Yo Sigo Aquí|Paulina Rubio|2000|https://www.youtube.com/watch?v=dfNWfnzUl4U",
  "global-spanish-requested-1998-ricky-martin-la-copa-de-la-vida|La Copa de la Vida|Ricky Martin|1998|https://www.youtube.com/watch?v=tF_ggG5dY5U",
  "global-spanish-requested-2002-aventura-obsesion|Obsesión|Aventura|2002|https://www.youtube.com/watch?v=8_QY5gFQUTg",
  "global-spanish-requested-1993-carlos-vives-la-gota-fria|La Gota Fría|Carlos Vives|1993|https://www.youtube.com/watch?v=Nmb80HXWsFQ",
  "global-spanish-requested-2021-sebastian-yatra-tacones-rojos|Tacones Rojos|Sebastián Yatra|2021|https://www.youtube.com/watch?v=Qz9gmiLBVFA",
  "global-spanish-requested-2022-manuel-turizo-la-bachata|La Bachata|Manuel Turizo|2022|https://www.youtube.com/watch?v=TiM_TFpT_DE",
  "global-spanish-requested-2001-chambao-ahi-estas-tu|Ahí Estás Tú|Chambao|2001|https://www.youtube.com/watch?v=0R4ZiXlWig8",
  "global-spanish-requested-1996-nina-pastori-tu-me-camelas|Tú Me Camelas|Niña Pastori|1996|https://www.youtube.com/watch?v=uRFbcT9ZRBA",
  "global-spanish-requested-2005-el-barrio-pa-madrid|Pa' Madrid|El Barrio|2005|https://www.youtube.com/watch?v=ot4jhKgf5MY",
  "global-spanish-requested-2007-fondo-flamenco-mi-estrella-blanca|Mi Estrella Blanca|Fondo Flamenco|2007|https://www.youtube.com/watch?v=w49hnpoCEvo",
  "global-spanish-requested-2003-andy-y-lucas-tanto-la-queria|Tanto la Quería|Andy & Lucas|2003|https://www.youtube.com/watch?v=b81kOviE7EI",
  "global-spanish-requested-1992-kiko-veneno-en-un-mercedes-blanco|En un Mercedes Blanco|Kiko Veneno|1992|https://www.youtube.com/watch?v=sJsgC-hnQZk",
  "global-spanish-requested-1984-miguel-bose-amante-bandido|Amante Bandido|Miguel Bosé|1984|https://www.youtube.com/watch?v=smfo5w7sKMY",
  "global-spanish-requested-1978-victor-manuel-solo-pienso-en-ti|Solo Pienso en Ti|Víctor Manuel|1978|https://www.youtube.com/watch?v=b8sZKQk7RMs",
  "global-spanish-requested-1985-joaquin-sabina-princesa|Princesa|Joaquín Sabina|1985|https://www.youtube.com/watch?v=FzKlIHvLaAI",
  "global-spanish-requested-1971-joan-manuel-serrat-mediterraneo|Mediterráneo|Joan Manuel Serrat|1971|https://www.youtube.com/watch?v=Cx5ENAFTLZg",
  "global-spanish-requested-1978-luis-eduardo-aute-al-alba|Al Alba|Luis Eduardo Aute|1978|https://www.youtube.com/watch?v=0U_Qic-AZv8",
  "global-spanish-requested-1992-antonio-vega-el-sitio-de-mi-recreo|El Sitio de mi Recreo|Antonio Vega|1992|https://www.youtube.com/watch?v=KgjfPcjWkyg",
  "global-spanish-requested-1998-manolo-garcia-pajaros-de-barro|Pájaros de Barro|Manolo García|1998|https://www.youtube.com/watch?v=HSpeF-Bu26E",
  "global-spanish-requested-1993-el-ultimo-de-la-fila-como-un-burro-amarrado-en-la-puerta-del-baile|Como un Burro Amarrado en la Puerta del Baile|El Último de la Fila|1993|https://www.youtube.com/watch?v=V0T_6bxb73Q",
  "global-spanish-requested-1988-duo-dinamico-resistire|Resistiré|Dúo Dinámico|1988|https://www.youtube.com/watch?v=K1rKj6XMt4Q",
  "global-spanish-requested-1982-alaska-y-los-pegamoides-bailando|Bailando|Alaska y los Pegamoides|1982|https://www.youtube.com/watch?v=R2EnbNk4wIc",
  "global-spanish-requested-1987-tino-casal-eloise|Eloise|Tino Casal|1987|https://www.youtube.com/watch?v=ym3TLFr9g_8",
  "global-spanish-requested-1983-ole-ole-no-controles|No Controles|Olé Olé|1983|https://www.youtube.com/watch?v=DHIRo-0BA6Y",
  "global-spanish-requested-2005-los-delinquentes-la-primavera-trompetera|La Primavera Trompetera|Los Delinqüentes|2005|https://www.youtube.com/watch?v=dPBbLYGJj5s",
] as const;

const GLOBAL_LATIN_CURRENT_REQUESTED_PACK_ID = "global-latin-current-requested-2026-08-15";

const GLOBAL_LATIN_CURRENT_REQUESTED_PACK_ROWS = [
  "global-latin-current-requested-2019-daddy-yankee-y-snow-calma|Con Calma|Daddy Yankee y Snow|2019|https://www.youtube.com/watch?v=DiItGE3eAyQ",
  "global-latin-current-requested-2023-vicco-nochentera|Nochentera|Vicco|2023|https://www.youtube.com/watch?v=1j_dSNUGU-U",
  "global-latin-current-requested-2023-marshmello-y-manuel-turizo-el-merengue|El Merengue|Marshmello y Manuel Turizo|2023|https://www.youtube.com/watch?v=25vNYV0qdgA",
  "global-latin-current-requested-2023-sebastian-yatra-manuel-turizo-y-beele-vagabundo|Vagabundo|Sebastián Yatra, Manuel Turizo y Beéle|2023|https://www.youtube.com/watch?v=0J1hIERZ1yA",
  "global-latin-current-requested-2016-ricky-martin-y-maluma-vente-pa-ca|Vente Pa' Ca|Ricky Martin y Maluma|2016|https://www.youtube.com/watch?v=iOe6dI2JhgU",
  "global-latin-current-requested-2018-becky-g-y-natti-natasha-sin-pijama|Sin Pijama|Becky G y Natti Natasha|2018|https://www.youtube.com/watch?v=zEf423kYfqk",
  "global-latin-current-requested-2019-rosalia-y-ozuna-yo-x-ti-tu-x-mi|Yo x Ti, Tu x Mi|Rosalía y Ozuna|2019|https://www.youtube.com/watch?v=2j3x0VYnehg",
  "global-latin-current-requested-2020-rosalia-y-travis-scott-tkn|TKN|Rosalía y Travis Scott|2020|https://www.youtube.com/watch?v=q5xIoeG4uVI",
  "global-latin-current-requested-2018-nio-garcia-casper-magico-darell-nicky-jam-bad-bunny-y-ozuna-te-bote-remix|Te Boté (Remix)|Nio García, Casper Mágico, Darell, Nicky Jam, Bad Bunny y Ozuna|2018|https://www.youtube.com/watch?v=9jI-z9QN6g8",
  "global-latin-current-requested-2019-anuel-aa-daddy-yankee-karol-g-ozuna-y-j-balvin-china|China|Anuel AA, Daddy Yankee, Karol G, Ozuna y J Balvin|2019|https://www.youtube.com/watch?v=0VR3dfZf9Yg",
  "global-latin-current-requested-2019-anuel-aa-y-karol-g-secreto|Secreto|Anuel AA y Karol G|2019|https://www.youtube.com/watch?v=gFZfwWZV074",
  "global-latin-current-requested-2023-karol-g-y-shakira-tqg|TQG|Karol G y Shakira|2023|https://www.youtube.com/watch?v=jZGpkLElSu8",
  "global-latin-current-requested-2017-ozuna-el-farsante|El Farsante|Ozuna|2017|https://www.youtube.com/watch?v=pCXt7o2eBXg",
  "global-latin-current-requested-2017-natti-natasha-y-ozuna-criminal|Criminal|Natti Natasha y Ozuna|2017|https://www.youtube.com/watch?v=VqEbCxg2bNI",
  "global-latin-current-requested-2018-ozuna-y-manuel-turizo-vaina-loca|Vaina Loca|Ozuna y Manuel Turizo|2018|https://www.youtube.com/watch?v=bx-fuY7LpSU",
  "global-latin-current-requested-2019-maluma-11-pm|11 PM|Maluma|2019|https://www.youtube.com/watch?v=IBaSizQyC5g",
  "global-latin-current-requested-2019-maluma-hp|HP|Maluma|2019|https://www.youtube.com/watch?v=iMEhjsiHbwM",
  "global-latin-current-requested-2017-maluma-y-nego-do-borel-corazon|Corazón|Maluma y Nego do Borel|2017|https://www.youtube.com/watch?v=GmHrjFIWl6U",
  "global-latin-current-requested-2017-shakira-me-enamore|Me Enamoré|Shakira|2017|https://www.youtube.com/watch?v=sPTn0QEhxds",
  "global-latin-current-requested-2017-shakira-y-nicky-jam-perro-fiel|Perro Fiel|Shakira y Nicky Jam|2017|https://www.youtube.com/watch?v=SHq2qrFUlGY",
  "global-latin-current-requested-2016-sebastian-yatra-traicionera|Traicionera|Sebastián Yatra|2016|https://www.youtube.com/watch?v=RQtacjTV_lk",
  "global-latin-current-requested-2017-carlos-vives-y-sebastian-yatra-robarte-un-beso|Robarte un Beso|Carlos Vives y Sebastián Yatra|2017|https://www.youtube.com/watch?v=Mtau4v6foHA",
  "global-latin-current-requested-2016-carlos-vives-y-shakira-la-bicicleta|La Bicicleta|Carlos Vives y Shakira|2016|https://www.youtube.com/watch?v=-UV0QGLmYys",
  "global-latin-current-requested-2015-wisin-carlos-vives-y-daddy-yankee-nota-de-amor|Nota de Amor|Wisin, Carlos Vives y Daddy Yankee|2015|https://www.youtube.com/watch?v=wZRWpr1G1Qw",
  "global-latin-current-requested-2016-wisin-vacaciones|Vacaciones|Wisin|2016|https://www.youtube.com/watch?v=ULoXlXJOZOo",
  "global-latin-current-requested-2017-wisin-y-ozuna-escapate-conmigo|Escápate Conmigo|Wisin y Ozuna|2017|https://www.youtube.com/watch?v=3X9wEwulYhk",
  "global-latin-current-requested-2016-danny-ocean-me-rehuso|Me Rehúso|Danny Ocean|2016|https://www.youtube.com/watch?v=LbKcHy9cav0",
  "global-latin-current-requested-2020-rauw-alejandro-y-camilo-tattoo-remix|Tattoo (Remix)|Rauw Alejandro y Camilo|2020|https://www.youtube.com/watch?v=wJT-YKmlWJc",
  "global-latin-current-requested-2021-rauw-alejandro-y-chencho-corleone-desesperados|Desesperados|Rauw Alejandro y Chencho Corleone|2021|https://www.youtube.com/watch?v=K9mTSekTktw",
  "global-latin-current-requested-2022-rauw-alejandro-lyanno-y-brray-lokera|Lokera|Rauw Alejandro, Lyanno y Brray|2022|https://www.youtube.com/watch?v=0JeughwzfR0",
  "global-latin-current-requested-2023-feid-y-young-miko-classy-101|Classy 101|Feid y Young Miko|2023|https://www.youtube.com/watch?v=cD5T1Y4b7wA",
  "global-latin-current-requested-2022-feid-normal|Normal|Feid|2022|https://www.youtube.com/watch?v=oD5f55ohsc4",
  "global-latin-current-requested-2022-feid-feliz-cumpleanos-ferxxo|Feliz Cumpleaños Ferxxo|Feid|2022|https://www.youtube.com/watch?v=jRxDUsGmwuc",
  "global-latin-current-requested-2022-ozuna-y-feid-hey-mor|Hey Mor|Ozuna y Feid|2022|https://www.youtube.com/watch?v=7ouFkoU8Ap8",
  "global-latin-current-requested-2022-mora-y-feid-la-inocente|La Inocente|Mora y Feid|2022|https://www.youtube.com/watch?v=ckuGLT1VkGw",
  "global-latin-current-requested-2022-mora-y-jhay-cortez-memorias|Memorias|Mora y Jhay Cortez|2022|https://www.youtube.com/watch?v=hoWI-y21ttw",
  "global-latin-current-requested-2021-mora-bad-bunny-y-sech-volando-remix|Volando (Remix)|Mora, Bad Bunny y Sech|2021|https://www.youtube.com/watch?v=P982oehprfY",
  "global-latin-current-requested-2019-sech-y-darell-otro-trago|Otro Trago|Sech y Darell|2019|https://www.youtube.com/watch?v=BeOcp9pCLRU",
  "global-latin-current-requested-2020-sech-daddy-yankee-j-balvin-rosalia-y-farruko-relacion-remix|Relación (Remix)|Sech, Daddy Yankee, J Balvin, Rosalía y Farruko|2020|https://www.youtube.com/watch?v=XseIJg8Vyj0",
  "global-latin-current-requested-2020-bad-bunny-y-sech-ignorantes|Ignorantes|Bad Bunny y Sech|2020|https://www.youtube.com/watch?v=PC0GvyEIXfk",
  "global-latin-current-requested-2020-bad-bunny-jowell-y-randy-y-nengo-flow-safaera|Safaera|Bad Bunny, Jowell & Randy y Ñengo Flow|2020|https://www.youtube.com/watch?v=jCQ_6XbATPc",
  "global-latin-current-requested-2020-bad-bunny-yo-perreo-sola|Yo Perreo Sola|Bad Bunny|2020|https://www.youtube.com/watch?v=GtSRKwDCaZM",
  "global-latin-current-requested-2019-bad-bunny-vete|Vete|Bad Bunny|2019|https://www.youtube.com/watch?v=f5aDUB1NCnk",
  "global-latin-current-requested-2018-c-tangana-llorando-en-la-limo|Llorando en la Limo|C. Tangana|2018|https://www.youtube.com/watch?v=CMCun6AOS44",
  "global-latin-current-requested-2019-bad-gyal-zorra|Zorra|Bad Gyal|2019|https://www.youtube.com/watch?v=ND2riyDD_oo",
  "global-latin-current-requested-2020-bad-gyal-y-juanka-blin-blin|Blin Blin|Bad Gyal y Juanka|2020|https://www.youtube.com/watch?v=cFX4WR3g-kA",
  "global-latin-current-requested-2019-fred-de-palma-y-ana-mena-se-iluminaba|Se Iluminaba|Fred De Palma y Ana Mena|2019|https://www.youtube.com/watch?v=5tFv5ILJ6N8",
  "global-latin-current-requested-2022-rigoberta-bandini-ay-mama|Ay Mamá|Rigoberta Bandini|2022|https://www.youtube.com/watch?v=-z9qeALR7j0",
  "global-latin-current-requested-2020-alvaro-de-luna-juramento-eterno-de-sal|Juramento Eterno de Sal|Álvaro de Luna|2020|https://www.youtube.com/watch?v=VebVifKv3UM",
  "global-latin-current-requested-2023-alvaro-de-luna-todo-contigo|Todo Contigo|Álvaro de Luna|2023|https://www.youtube.com/watch?v=oie3H4ocMCc",
  "global-latin-current-requested-2022-aitana-y-sangiovanni-mariposas|Mariposas|Aitana y Sangiovanni|2022|https://www.youtube.com/watch?v=CCFR7ujKt3s",
  "global-latin-current-requested-2025-violeta-i-delirio|I. deliriO|VIOLETA|2025|https://www.youtube.com/watch?v=OBLimAGYiyw",
] as const;

const GLOBAL_PARTY_LATIN_REQUESTED_PACK_ID = "global-party-latin-requested-2026-08-15";

const GLOBAL_PARTY_LATIN_REQUESTED_PACK_ROWS = [
  "global-party-latin-requested-2011-alberto-gambino-purpurina|Purpurina|Alberto Gambino|2011|https://www.youtube.com/watch?v=EZOQnj-mPPA",
  "global-party-latin-requested-2011-lmfao-lauren-bennett-y-goonrock-party-rock-anthem|Party Rock Anthem|LMFAO, Lauren Bennett y GoonRock|2011|https://www.youtube.com/watch?v=KQ6zr6kCPj8",
  "global-party-latin-requested-2011-lmfao-sexy-y-i-know-it|Sexy And I Know It|LMFAO|2011|https://www.youtube.com/watch?v=wyx6JDQCslE",
  "global-party-latin-requested-2009-lmfao-y-lil-jon-shots|Shots|LMFAO y Lil Jon|2009|https://www.youtube.com/watch?v=XNtTEibFvlQ",
  "global-party-latin-requested-2011-lmfao-sorry-for-party-rocking|Sorry For Party Rocking|LMFAO|2011|https://www.youtube.com/watch?v=SkTt9k4Y-a8",
  "global-party-latin-requested-2010-duck-sauce-barbra-streisand|Barbra Streisand|Duck Sauce|2010|https://www.youtube.com/watch?v=UpxKKBLUP2g",
  "global-party-latin-requested-2012-david-guetta-ne-yo-y-akon-play-hard|Play Hard|David Guetta, Ne-Yo y Akon|2012|https://www.youtube.com/watch?v=5dbEhBKGOtY",
  "global-party-latin-requested-2013-pitbull-y-kesha-timber|Timber|Pitbull y Kesha|2013|https://www.youtube.com/watch?v=hHUbLv4ThOo",
  "global-party-latin-requested-2011-pitbull-ne-yo-afrojack-y-nayer-give-me-everything|Give Me Everything|Pitbull, Ne-Yo, Afrojack y Nayer|2011|https://www.youtube.com/watch?v=EPo5wWmKEaI",
  "global-party-latin-requested-2011-jennifer-lopez-y-pitbull-on-the-floor|On The Floor|Jennifer Lopez y Pitbull|2011|https://www.youtube.com/watch?v=t4H_Zoh7G5A",
  "global-party-latin-requested-2011-don-omar-taboo|Taboo|Don Omar|2011|https://www.youtube.com/watch?v=lRWqYR3e7xE",
  "global-party-latin-requested-2012-jose-de-rico-y-henry-mendez-noche-de-estrellas|Noche de Estrellas|Jose De Rico y Henry Mendez|2012|https://www.youtube.com/watch?v=_EvqmOIXGN0",
  "global-party-latin-requested-2012-yandar-y-yostin-y-andy-rivera-te-pintaron-pajaritos|Te Pintaron Pajaritos|Yandar & Yostin y Andy Rivera|2012|https://www.youtube.com/watch?v=uGFBZWnBpCc",
  "global-party-latin-requested-2014-pitbull-sensato-y-osmani-garcia-el-taxi|El Taxi|Pitbull, Sensato y Osmani Garcia|2014|https://www.youtube.com/watch?v=qRp3-D3SMwI",
  "global-party-latin-requested-2014-romeo-santos-y-drake-odio|Odio|Romeo Santos y Drake|2014|https://www.youtube.com/watch?v=W8r-eIhp4j0",
  "global-party-latin-requested-2013-prince-royce-darte-un-beso|Darte un Beso|Prince Royce|2013|https://www.youtube.com/watch?v=bdOXnTbyk0g",
  "global-party-latin-requested-2017-prince-royce-y-shakira-deja-vu|Deja Vu|Prince Royce y Shakira|2017|https://www.youtube.com/watch?v=XEvKn-QgAY0",
  "global-party-latin-requested-2014-romeo-santos-hilito|Hilito|Romeo Santos|2014|https://www.youtube.com/watch?v=4eCL0l9iD5A",
  "global-party-latin-requested-2014-romeo-santos-cancioncitas-de-amor|Cancioncitas de Amor|Romeo Santos|2014|https://www.youtube.com/watch?v=CoibU-nb-ik",
  "global-party-latin-requested-2005-aventura-y-don-omar-ella-y-yo|Ella y Yo|Aventura y Don Omar|2005|https://www.youtube.com/watch?v=Lg_Pn45gyMs",
  "global-party-latin-requested-2008-aventura-el-perdedor|El Perdedor|Aventura|2008|https://www.youtube.com/watch?v=elGZbcpGzdU",
  "global-party-latin-requested-2011-romeo-santos-la-diabla|La Diabla|Romeo Santos|2011|https://www.youtube.com/watch?v=Hz9lhqxl_gQ",
  "global-party-latin-requested-2011-romeo-santos-llevame-contigo|Llévame Contigo|Romeo Santos|2011|https://www.youtube.com/watch?v=17g14QfpcF0",
  "global-party-latin-requested-2017-romeo-santos-daddy-yankee-y-nicky-jam-bella-y-sensual|Bella y Sensual|Romeo Santos, Daddy Yankee y Nicky Jam|2017|https://www.youtube.com/watch?v=RSRzIrOqaN4",
  "global-party-latin-requested-2023-lola-indigo-soolking-y-rvfv-casanova|Casanova|Lola Indigo, Soolking y Rvfv|2023|https://www.youtube.com/watch?v=tmSm-tnifVk",
  "global-party-latin-requested-2023-lola-indigo-y-luis-fonsi-corazones-rotos|Corazones Rotos|Lola Indigo y Luis Fonsi|2023|https://www.youtube.com/watch?v=pR862HV1mb0",
  "global-party-latin-requested-2019-tini-y-lalo-ebratt-fresa|Fresa|TINI y Lalo Ebratt|2019|https://www.youtube.com/watch?v=JmeyoMooJPY",
  "global-party-latin-requested-2021-tini-y-l-gante-bar|Bar|TINI y L-Gante|2021|https://www.youtube.com/watch?v=0f3ZHuC-l0c",
  "global-party-latin-requested-2019-tini-y-sebastian-yatra-oye|Oye|TINI y Sebastián Yatra|2019|https://www.youtube.com/watch?v=azfKhDMIrZo",
  "global-party-latin-requested-2019-tini-y-greeicy-22|22|TINI y Greeicy|2019|https://www.youtube.com/watch?v=0S3enulCT8E",
  "global-party-latin-requested-2022-emilia-y-nicki-nicole-intoxicao|Intoxicao|Emilia y Nicki Nicole|2022|https://www.youtube.com/watch?v=dPjA_lBdoU0",
  "global-party-latin-requested-2022-emilia-la-chain|La Chain|Emilia|2022|https://www.youtube.com/watch?v=S9ri2ZVbqS8",
  "global-party-latin-requested-2024-los-angeles-azules-y-emilia-perdonarte-para-que|Perdonarte, ¿Para Qué?|Los Ángeles Azules y Emilia|2024|https://www.youtube.com/watch?v=beH6uqy6Xsw",
  "global-party-latin-requested-2021-maria-becerra-y-cazzu-animal|Animal|María Becerra y Cazzu|2021|https://www.youtube.com/watch?v=Uw0FZRTnPLc",
  "global-party-latin-requested-2023-maria-becerra-adios|Adiós|María Becerra|2023|https://www.youtube.com/watch?v=2qfUMZC55so",
  "global-party-latin-requested-2020-maria-becerra-tini-y-lola-indigo-high-remix|High (Remix)|María Becerra, TINI y Lola Indigo|2020|https://www.youtube.com/watch?v=dwFErlULaJ0",
  "global-party-latin-requested-2020-nicki-nicole-mala-vida|Mala Vida|Nicki Nicole|2020|https://www.youtube.com/watch?v=aRh8QJoXkGQ",
  "global-party-latin-requested-2022-cris-mj-duki-nicki-nicole-y-standly-marisola-remix|Marisola (Remix)|Cris Mj, Duki, Nicki Nicole y Standly|2022|https://www.youtube.com/watch?v=BVQatzChOqo",
  "global-party-latin-requested-2023-lit-killah-tiago-pzk-maria-becerra-duki-emilia-rusherking-big-one-y-fmk-los-del-espacio|Los del Espacio|LIT killah, Tiago PZK, María Becerra, Duki, Emilia, Rusherking, Big One y FMK|2023|https://www.youtube.com/watch?v=eBSQug_xtwc",
  "global-party-latin-requested-2021-tiago-pzk-y-lit-killah-entre-nosotros|Entre Nosotros|Tiago PZK y LIT killah|2021|https://www.youtube.com/watch?v=FMA8X18-W1Q",
  "global-party-latin-requested-2021-tiago-pzk-y-trueno-salimo-de-noche|Salimo de Noche|Tiago PZK y Trueno|2021|https://www.youtube.com/watch?v=IXBtBsK6Fmo",
  "global-party-latin-requested-2021-bizarrap-y-snow-tha-product-bzrp-music-sessions-vol-39|BZRP Music Sessions, Vol. 39|Bizarrap y Snow Tha Product|2021|https://www.youtube.com/watch?v=t490zXLrQDE",
  "global-party-latin-requested-2022-bizarrap-y-paulo-londra-bzrp-music-sessions-vol-23|BZRP Music Sessions, Vol. 23|Bizarrap y Paulo Londra|2022|https://www.youtube.com/watch?v=WkgHkrM9fo0",
  "global-party-latin-requested-2023-eslabon-armado-y-peso-pluma-ella-baila-sola|Ella Baila Sola|Eslabon Armado y Peso Pluma|2023|https://www.youtube.com/watch?v=lZiaYpD9ZrI",
  "global-party-latin-requested-2023-yng-lvcas-y-peso-pluma-la-bebe-remix|La Bebe (Remix)|Yng Lvcas y Peso Pluma|2023|https://www.youtube.com/watch?v=3mchJ-EW9rM",
  "global-party-latin-requested-2023-karol-g-y-peso-pluma-qlona|QLONA|Karol G y Peso Pluma|2023|https://www.youtube.com/watch?v=BeUOBoSPWvA",
  "global-party-latin-requested-2021-karol-g-200-copas|200 Copas|Karol G|2021|https://www.youtube.com/watch?v=Zdc3shRvumk",
  "global-party-latin-requested-2020-karol-g-ay-dios-mio|Ay, DiOs Mío!|Karol G|2020|https://www.youtube.com/watch?v=Ou2c2aj5Fcw",
  "global-party-latin-requested-2019-karol-g-punto-g|Punto G|Karol G|2019|https://www.youtube.com/watch?v=sgBZVLr91ug",
  "global-party-latin-requested-2018-karol-g-y-anuel-aa-culpables|Culpables|Karol G y Anuel AA|2018|https://www.youtube.com/watch?v=xfdG6vwIGGU",
  "global-party-latin-requested-2017-karol-g-y-bad-bunny-ahora-me-llama|Ahora Me Llama|Karol G y Bad Bunny|2017|https://www.youtube.com/watch?v=4NNRy_Wz16k",
  "global-party-latin-requested-2018-karol-g-pineapple|Pineapple|Karol G|2018|https://www.youtube.com/watch?v=8q1NFlE17qs",
  "global-party-latin-requested-2019-residente-y-bad-bunny-bellacoso|Bellacoso|Residente y Bad Bunny|2019|https://www.youtube.com/watch?v=46rJ4y2kdow",
  "global-party-latin-requested-2019-jhay-cortez-j-balvin-y-bad-bunny-no-me-conoce-remix|No Me Conoce (Remix)|Jhay Cortez, J Balvin y Bad Bunny|2019|https://www.youtube.com/watch?v=w2C6RhQBYlg",
  "global-party-latin-requested-2021-jhay-cortez-y-anuel-aa-ley-seca|Ley Seca|Jhay Cortez y Anuel AA|2021|https://www.youtube.com/watch?v=tXHhgLkBml4",
  "global-party-latin-requested-2021-los-legendarios-wisin-y-jhay-cortez-fiel|Fiel|Los Legendarios, Wisin y Jhay Cortez|2021|https://www.youtube.com/watch?v=o1lKMrLat_I",
  "global-party-latin-requested-2021-j-balvin-karol-g-nicky-jam-crissin-totoy-el-frio-y-natan-y-shander-poblado-remix|Poblado (Remix)|J Balvin, Karol G, Nicky Jam, Crissin, Totoy El Frio y Natan & Shander|2021|https://www.youtube.com/watch?v=s8hA0QRIwfo",
  "global-party-latin-requested-2021-nio-garcia-j-balvin-y-bad-bunny-am-remix|AM Remix|Nio Garcia, J Balvin y Bad Bunny|2021|https://www.youtube.com/watch?v=RNzQdcPWWX4",
  "global-party-latin-requested-2020-bad-bunny-te-mudaste|Te Mudaste|Bad Bunny|2020|https://www.youtube.com/watch?v=4qt2P9Tcnhs",
  "global-party-latin-requested-2019-j-balvin-y-bad-bunny-la-cancion|La Canción|J Balvin y Bad Bunny|2019|https://www.youtube.com/watch?v=LxOTsiV4tkQ",
  "global-party-latin-requested-2019-j-balvin-y-bad-bunny-que-pretendes|Qué Pretendes|J Balvin y Bad Bunny|2019|https://www.youtube.com/watch?v=kPc3Pe42bGI",
  "global-party-latin-requested-2019-dj-snake-j-balvin-y-tyga-loco-contigo|Loco Contigo|DJ Snake, J Balvin y Tyga|2019|https://www.youtube.com/watch?v=zNl00mOSnJI",
  "global-party-latin-requested-2019-black-eyed-peas-y-j-balvin-ritmo-bad-boys-for-life|Ritmo (Bad Boys For Life)|Black Eyed Peas y J Balvin|2019|https://www.youtube.com/watch?v=EzKkl64rRbM",
  "global-party-latin-requested-2018-cardi-b-bad-bunny-y-j-balvin-i-like-it|I Like It|Cardi B, Bad Bunny y J Balvin|2018|https://www.youtube.com/watch?v=xTlNMmZKwpA",
  "global-party-latin-requested-2018-dj-snake-selena-gomez-ozuna-y-cardi-b-taki-taki|Taki Taki|DJ Snake, Selena Gomez, Ozuna y Cardi B|2018|https://www.youtube.com/watch?v=ixkoVwKQaJg",
  "global-party-latin-requested-2018-daddy-yankee-dura|Dura|Daddy Yankee|2018|https://www.youtube.com/watch?v=sGIm0-dQd8M",
  "global-party-latin-requested-2016-daddy-yankee-shaky-shaky|Shaky Shaky|Daddy Yankee|2016|https://www.youtube.com/watch?v=aKuivabiOns",
  "global-party-latin-requested-2012-daddy-yankee-limbo|Limbo|Daddy Yankee|2012|https://www.youtube.com/watch?v=6BTjG-dhf5s",
  "global-party-latin-requested-2015-daddy-yankee-sigueme-y-te-sigo|Sígueme y Te Sigo|Daddy Yankee|2015|https://www.youtube.com/watch?v=EfF9EE6ZR5E",
  "global-party-latin-requested-2016-chino-y-nacho-y-daddy-yankee-andas-en-mi-cabeza|Andas En Mi Cabeza|Chino & Nacho y Daddy Yankee|2016|https://www.youtube.com/watch?v=AMTAQ-AJS4Y",
  "global-party-latin-requested-2016-nicky-jam-hasta-el-amanecer|Hasta el Amanecer|Nicky Jam|2016|https://www.youtube.com/watch?v=kkx-7fsiWgg",
  "global-party-latin-requested-2017-nicky-jam-el-amante|El Amante|Nicky Jam|2017|https://www.youtube.com/watch?v=YG2p6XBuSKA",
  "global-party-latin-requested-2018-nicky-jam-y-j-balvin-x|X|Nicky Jam y J Balvin|2018|https://www.youtube.com/watch?v=_I_D_8Z4sJE",
  "global-party-latin-requested-2012-don-omar-zumba|Zumba|Don Omar|2012|https://www.youtube.com/watch?v=pu5PZugNiJU",
  "global-party-latin-requested-2025-violeta-iii-cruel-final|III. Cruel final|VIOLETA|2025|https://www.youtube.com/watch?v=kbANGKqLfR8",
] as const;

const GLOBAL_DIVAS_POP_REQUESTED_PACK_ID = "global-divas-pop-requested-2026-08-15";

const GLOBAL_DIVAS_POP_REQUESTED_PACK_ROWS = [
  "global-divas-pop-requested-2018-jorja-smith-blue-lights|Blue Lights|Jorja Smith|2018|https://www.youtube.com/watch?v=R8YwnQMQuJI",
  "global-divas-pop-requested-2022-jvke-golden-hour|golden hour|JVKE|2022|https://www.youtube.com/watch?v=PEM0Vs8jf1w",
  "global-divas-pop-requested-2000-amaral-como-hablar|Cómo hablar|Amaral|2000|https://www.youtube.com/watch?v=DjkLlTLMNDs",
  "global-divas-pop-requested-2025-zara-larsson-midnight-sun|Midnight Sun|Zara Larsson|2025|https://www.youtube.com/watch?v=uvY8fdgezLQ",
  "global-divas-pop-requested-2018-billie-eilish-y-khalid-lovely|lovely|Billie Eilish y Khalid|2018|https://www.youtube.com/watch?v=V1Pl8CzNzCw",
  "global-divas-pop-requested-2025-raye-where-is-my-husband|WHERE IS MY HUSBAND!|RAYE|2025|https://www.youtube.com/watch?v=rK5TyISxZ_M",
  "global-divas-pop-requested-2025-sabrina-carpenter-manchild|Manchild|Sabrina Carpenter|2025|https://www.youtube.com/watch?v=aSugSGCC12I",
  "global-divas-pop-requested-2021-kali-uchis-telepatia|telepatía|Kali Uchis|2021|https://www.youtube.com/watch?v=bn_p95HbHoQ",
  "global-divas-pop-requested-2022-sam-smith-y-kim-petras-unholy|Unholy|Sam Smith y Kim Petras|2022|https://www.youtube.com/watch?v=Uq9gPaIzbe8",
  "global-divas-pop-requested-2023-kylie-minogue-padam-padam|Padam Padam|Kylie Minogue|2023|https://www.youtube.com/watch?v=p6Cnazi_Fi0",
  "global-divas-pop-requested-2011-lady-gaga-judas|Judas|Lady Gaga|2011|https://www.youtube.com/watch?v=wagn8Wrmzuc",
  "global-divas-pop-requested-2010-pastora-soler-la-mala-costumbre|La mala costumbre|Pastora Soler|2010|https://www.youtube.com/watch?v=0Btl-A8tZ-4",
  "global-divas-pop-requested-2011-britney-spears-criminal|Criminal|Britney Spears|2011|https://www.youtube.com/watch?v=s6b33PTbGxk",
  "global-divas-pop-requested-2024-charli-xcx-von-dutch|Von dutch|Charli xcx|2024|https://www.youtube.com/watch?v=cwZ1L_0QLjw",
  "global-divas-pop-requested-1992-whitney-houston-i-have-nothing|I Have Nothing|Whitney Houston|1992|https://www.youtube.com/watch?v=FxYw0XPEoKE",
  "global-divas-pop-requested-2006-beyonce-listen|Listen|Beyoncé|2006|https://www.youtube.com/watch?v=y4gimHC7fKs",
  "global-divas-pop-requested-2015-sia-alive|Alive|Sia|2015|https://www.youtube.com/watch?v=t2NgsJrrAyM",
  "global-divas-pop-requested-2006-christina-aguilera-hurt|Hurt|Christina Aguilera|2006|https://www.youtube.com/watch?v=wwCykGDEp7M",
  "global-divas-pop-requested-2002-christina-aguilera-fighter|Fighter|Christina Aguilera|2002|https://www.youtube.com/watch?v=PstrAfoMKlc",
  "global-divas-pop-requested-1990-mariah-carey-vision-of-love|Vision of Love|Mariah Carey|1990|https://www.youtube.com/watch?v=tov22NtCMC4",
  "global-divas-pop-requested-1993-mariah-carey-hero|Hero|Mariah Carey|1993|https://www.youtube.com/watch?v=0IA3ZvCkRkQ",
  "global-divas-pop-requested-2006-amy-winehouse-tears-dry-on-their-own|Tears Dry On Their Own|Amy Winehouse|2006|https://www.youtube.com/watch?v=ojdbDYahiCQ",
  "global-divas-pop-requested-2006-amy-winehouse-back-to-black|Back To Black|Amy Winehouse|2006|https://www.youtube.com/watch?v=TJAfLE39ZZ8",
  "global-divas-pop-requested-2016-lady-gaga-million-reasons|Million Reasons|Lady Gaga|2016|https://www.youtube.com/watch?v=WYRJ-ryPEu0",
  "global-divas-pop-requested-2007-britney-spears-gimme-more|Gimme More|Britney Spears|2007|https://www.youtube.com/watch?v=elueA2rofoo",
  "global-divas-pop-requested-2000-kylie-minogue-spinning-around|Spinning Around|Kylie Minogue|2000|https://www.youtube.com/watch?v=t1DWBKk5xHQ",
  "global-divas-pop-requested-2013-malu-y-pablo-alboran-vuelvo-a-verte|Vuelvo a Verte|Malú y Pablo Alborán|2013|https://www.youtube.com/watch?v=RA4gD606n1Q",
  "global-divas-pop-requested-2017-pastora-soler-la-tormenta|La Tormenta|Pastora Soler|2017|https://www.youtube.com/watch?v=C30fQ5BpnEY",
  "global-divas-pop-requested-2004-m-clan-miedo|Miedo|M Clan|2004|https://www.youtube.com/watch?v=05lSSYQAENo",
  "global-divas-pop-requested-1998-enrique-urquijo-y-los-problemas-aunque-tu-no-lo-sepas|Aunque Tú No Lo Sepas|Enrique Urquijo y Los Problemas|1998|https://www.youtube.com/watch?v=o6OULHNV3js",
  "global-divas-pop-requested-2018-aitana-arde|Arde|Aitana|2018|https://www.youtube.com/watch?v=0WGJIp0Jzio",
  "global-divas-pop-requested-2020-aitana-11-razones|11 Razones|Aitana|2020|https://www.youtube.com/watch?v=a81quuhJQjA",
  "global-divas-pop-requested-2006-paulina-rubio-ni-una-sola-palabra|Ni Una Sola Palabra|Paulina Rubio|2006|https://www.youtube.com/watch?v=Kkdhtb9DVWQ",
  "global-divas-pop-requested-1997-monica-naranjo-desatame|Desátame|Mónica Naranjo|1997|https://www.youtube.com/watch?v=jpTOqGZCw10",
  "global-divas-pop-requested-1997-monica-naranjo-pantera-en-libertad|Pantera en Libertad|Mónica Naranjo|1997|https://www.youtube.com/watch?v=7Oqnqy9bfJ8",
  "global-divas-pop-requested-2021-sebastian-yatra-dos-oruguitas|Dos Oruguitas|Sebastián Yatra|2021|https://www.youtube.com/watch?v=n_k8H3uct1o",
  "global-divas-pop-requested-2019-alejandro-sanz-y-camila-cabello-mi-persona-favorita|Mi Persona Favorita|Alejandro Sanz y Camila Cabello|2019|https://www.youtube.com/watch?v=W4AiOKlOO0Q",
  "global-divas-pop-requested-2018-rosalia-pienso-en-tu-mira|Pienso en tu mirá|Rosalía|2018|https://www.youtube.com/watch?v=p_4coiRG_BI",
  "global-divas-pop-requested-2023-rosalia-y-rauw-alejandro-vampiros|Vampiros|Rosalía y Rauw Alejandro|2023|https://www.youtube.com/watch?v=21xNk2eD77o",
] as const;

const GLOBAL_CODEX_SUGGESTIONS_PACK_ID = "global-codex-suggestions-2026-08-15";

const GLOBAL_CODEX_SUGGESTIONS_PACK_ROWS = [
  "global-codex-suggestions-2002-el-canto-del-loco-y-amaia-montero-puede-ser|Puede ser|El Canto del Loco y Amaia Montero|2002|https://www.youtube.com/watch?v=lGVFzjxkDkQ",
  "global-codex-suggestions-2002-el-canto-del-loco-a-contracorriente|A contracorriente|El Canto del Loco|2002|https://www.youtube.com/watch?v=ccDUnNJqz_U",
  "global-codex-suggestions-2001-estopa-partiendo-la-pana|Partiendo la pana|Estopa|2001|https://www.youtube.com/watch?v=KJ2sDvWoQR0",
  "global-codex-suggestions-2003-alejandro-sanz-no-es-lo-mismo|No es lo mismo|Alejandro Sanz|2003|https://www.youtube.com/watch?v=xNgTMDRoa60",
  "global-codex-suggestions-2001-antonio-orozco-devuelveme-la-vida|Devuélveme la vida|Antonio Orozco|2001|https://www.youtube.com/watch?v=NNF9WrO005s",
  "global-codex-suggestions-2012-melendi-la-promesa|La promesa|Melendi|2012|https://www.youtube.com/watch?v=7XPmRUp_Yf4",
  "global-codex-suggestions-2008-la-oreja-de-van-gogh-el-ultimo-vals|El último vals|La Oreja de Van Gogh|2008|https://www.youtube.com/watch?v=wCTsuXSSUz0",
  "global-codex-suggestions-2005-amaral-marta-sebas-guille-y-los-demas|Marta, Sebas, Guille y los demás|Amaral|2005|https://www.youtube.com/watch?v=HPX-b6ZQD0s",
  "global-codex-suggestions-2008-vetusta-morla-copenhague|Copenhague|Vetusta Morla|2008|https://www.youtube.com/watch?v=F0X5IOQDni4",
  "global-codex-suggestions-2015-izal-la-mujer-de-verde|La mujer de verde|Izal|2015|https://www.youtube.com/watch?v=guzh1l71iAE",
  "global-codex-suggestions-2009-love-of-lesbian-alli-donde-soliamos-gritar|Allí donde solíamos gritar|Love of Lesbian|2009|https://www.youtube.com/watch?v=tZapJzlivGY",
  "global-codex-suggestions-1986-mecano-cruz-de-navajas|Cruz de navajas|Mecano|1986|https://www.youtube.com/watch?v=2-HWcpiA8t0",
  "global-codex-suggestions-1988-mecano-un-ano-mas|Un año más|Mecano|1988|https://www.youtube.com/watch?v=STnpL1COEyI",
  "global-codex-suggestions-2008-nena-daconte-tenia-tanto-que-darte|Tenía tanto que darte|Nena Daconte|2008|https://www.youtube.com/watch?v=rd8ZFtD5rM8",
  "global-codex-suggestions-2003-fito-y-fitipaldis-la-casa-por-el-tejado|La casa por el tejado|Fito y Fitipaldis|2003|https://www.youtube.com/watch?v=8qz8FqmTsJY",
  "global-codex-suggestions-2007-la-casa-azul-la-revolucion-sexual|La revolución sexual|La Casa Azul|2007|https://www.youtube.com/watch?v=juNxwa6H3lI",
  "global-codex-suggestions-1972-nino-bravo-libre|Libre|Nino Bravo|1972|https://www.youtube.com/watch?v=Qr_xKvt4HFM",
  "global-codex-suggestions-1972-nino-bravo-un-beso-y-una-flor|Un beso y una flor|Nino Bravo|1972|https://www.youtube.com/watch?v=d65A4aD2hmg",
  "global-codex-suggestions-1980-los-chunguitos-me-quedo-contigo|Me quedo contigo|Los Chunguitos|1980|https://www.youtube.com/watch?v=N-6R0usliNU",
  "global-codex-suggestions-1978-raffaella-carra-hay-que-venir-al-sur|Hay que venir al sur|Raffaella Carrà|1978|https://www.youtube.com/watch?v=0xvUdyVKZg4",
  "global-codex-suggestions-1988-georgie-dann-el-chiringuito|El chiringuito|Georgie Dann|1988|https://www.youtube.com/watch?v=JhsYLLH4GB4",
  "global-codex-suggestions-1983-eurythmics-sweet-dreams-are-made-of-this|Sweet Dreams (Are Made of This)|Eurythmics|1983|https://www.youtube.com/watch?v=qeMFqkcPYcg",
  "global-codex-suggestions-1981-soft-cell-tainted-love|Tainted Love|Soft Cell|1981|https://www.youtube.com/watch?v=XZVpR3Pk-r8",
  "global-codex-suggestions-2003-the-killers-mr-brightside|Mr. Brightside|The Killers|2003|https://www.youtube.com/watch?v=gGdGFtwCNBE",
  "global-codex-suggestions-2008-kings-of-leon-sex-on-fire|Sex on Fire|Kings of Leon|2008|https://www.youtube.com/watch?v=RF0HhrwIwp0",
  "global-codex-suggestions-2008-kings-of-leon-use-somebody|Use Somebody|Kings of Leon|2008|https://www.youtube.com/watch?v=gnhXHvRoUd0",
  "global-codex-suggestions-2007-kaiser-chiefs-ruby|Ruby|Kaiser Chiefs|2007|https://www.youtube.com/watch?v=qObzgUfCl28",
  "global-codex-suggestions-2006-the-kooks-naive|Naive|The Kooks|2006|https://www.youtube.com/watch?v=jkaMiaRLgvY",
  "global-codex-suggestions-1995-pulp-common-people|Common People|Pulp|1995|https://www.youtube.com/watch?v=yuTMWgOduFM",
  "global-codex-suggestions-1997-the-verve-bitter-sweet-symphony|Bitter Sweet Symphony|The Verve|1997|https://www.youtube.com/watch?v=1lyu1KKwC74",
  "global-codex-suggestions-1982-the-clash-should-i-stay-or-should-i-go|Should I Stay or Should I Go|The Clash|1982|https://www.youtube.com/watch?v=xMaE6toi4mk",
  "global-codex-suggestions-1991-guns-n-roses-november-rain|November Rain|Guns N' Roses|1991|https://www.youtube.com/watch?v=8SbUC-UaAxE",
  "global-codex-suggestions-1991-nirvana-come-as-you-are|Come As You Are|Nirvana|1991|https://www.youtube.com/watch?v=vabnZ9-ex7o",
  "global-codex-suggestions-1996-no-doubt-don-t-speak|Don't Speak|No Doubt|1996|https://www.youtube.com/watch?v=TR3Vdo5etCQ",
  "global-codex-suggestions-1998-goo-goo-dolls-iris|Iris|Goo Goo Dolls|1998|https://www.youtube.com/watch?v=NdYWuo9OFAw",
  "global-codex-suggestions-1997-natalie-imbruglia-torn|Torn|Natalie Imbruglia|1997|https://www.youtube.com/watch?v=VV1XWJN3nJo",
  "global-codex-suggestions-2004-kelly-clarkson-since-u-been-gone|Since U Been Gone|Kelly Clarkson|2004|https://www.youtube.com/watch?v=R7UrFYvl5TE",
  "global-codex-suggestions-2012-p-nk-y-nate-ruess-just-give-me-a-reason|Just Give Me a Reason|P!nk y Nate Ruess|2012|https://www.youtube.com/watch?v=OpQFFLBMEPI",
  "global-codex-suggestions-1999-ricky-martin-livin-la-vida-loca|Livin' la Vida Loca|Ricky Martin|1999|https://www.youtube.com/watch?v=p47fEXGabaY",
  "global-codex-suggestions-2001-enrique-iglesias-hero|Hero|Enrique Iglesias|2001|https://www.youtube.com/watch?v=koJlIGDImiU",
  "global-codex-suggestions-2006-julieta-venegas-y-anita-tijoux-eres-para-mi|Eres para mí|Julieta Venegas y Anita Tijoux|2006|https://www.youtube.com/watch?v=pj2ntDiXJCk",
  "global-codex-suggestions-2001-alex-ubago-y-amaia-montero-sin-miedo-a-nada|Sin miedo a nada|Álex Ubago y Amaia Montero|2001|https://www.youtube.com/watch?v=bigB30ufXYI",
  "global-codex-suggestions-2008-jason-mraz-i-m-yours|I'm Yours|Jason Mraz|2008|https://www.youtube.com/watch?v=EkHTsc9PU2A",
  "global-codex-suggestions-2009-train-hey-soul-sister|Hey, Soul Sister|Train|2009|https://www.youtube.com/watch?v=kVpv8-5XWOI",
  "global-codex-suggestions-2007-timbaland-y-onerepublic-apologize|Apologize|Timbaland y OneRepublic|2007|https://www.youtube.com/watch?v=nL5UtgVKr0A",
  "global-codex-suggestions-2012-the-script-y-will-i-am-hall-of-fame|Hall of Fame|The Script y will.i.am|2012|https://www.youtube.com/watch?v=mk48xRzuNvA",
  "global-codex-suggestions-2004-keane-somewhere-only-we-know|Somewhere Only We Know|Keane|2004|https://www.youtube.com/watch?v=Oextk-If8HQ",
  "global-codex-suggestions-2019-tones-y-i-dance-monkey|Dance Monkey|Tones and I|2019|https://www.youtube.com/watch?v=q0hyYWKXF0Q",
  "global-codex-suggestions-2018-ava-max-sweet-but-psycho|Sweet but Psycho|Ava Max|2018|https://www.youtube.com/watch?v=WXBHCQYxwr0",
] as const;

function parseGlobalHitPackTrack(row: string): Track {
  const [id, title, artist, year, youtubeUrl] = row.split("|");

  return {
    id,
    title,
    artist,
    year: Number(year),
    mode: "Globales",
    modes: defaultModesForTrack("Globales"),
    audioSrc: youtubeUrl,
    extra: {},
  };
}

const OT_POST_GLOBAL_HIT_DETAILS: Record<
  string,
  Partial<Record<GuessFieldId, string>>
> = {
  "global-hit-es-aitana-telefono": {
    otPerformers: "Aitana",
    otEdition: "OT 2017",
    otGala: "Post",
    otNominations: "Post OT / single",
  },
  "global-hit-es-lola-indigo-ya-no-quiero-na": {
    otPerformers: "Lola Indigo",
    otEdition: "OT 2017",
    otGala: "Post",
    otNominations: "Post OT / single",
  },
};

function enrichGlobalHitWithOtPostData(track: Track): Track {
  const otExtra = OT_POST_GLOBAL_HIT_DETAILS[track.id];

  if (!otExtra) {
    return track;
  }

  return {
    ...track,
    modes: uniqueTrackModes(
      [...modesForTrack(track.mode, track.modes), "OT"],
      track.mode,
    ),
    extra: {
      ...track.extra,
      ...otExtra,
    },
  };
}

const GLOBAL_HITS_PACK = GLOBAL_HITS_PACK_ROWS.map(parseGlobalHitPackTrack);
const GLOBAL_SPANISH_HITS_PACK = GLOBAL_SPANISH_HITS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
).map(enrichGlobalHitWithOtPostData);
const GLOBAL_LATIN_HITS_PACK = GLOBAL_LATIN_HITS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);
const GLOBAL_CURRENT_POP_PACK = GLOBAL_CURRENT_POP_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);
const GLOBAL_2025_2026_LATIN_PACK = GLOBAL_2025_2026_LATIN_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);
const GLOBAL_MASSIVE_POP_PACK = GLOBAL_MASSIVE_POP_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);
const GLOBAL_REQUESTED_CLASSICS_PACK = GLOBAL_REQUESTED_CLASSICS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_REQUESTED_POP_DANCE_PACK = GLOBAL_REQUESTED_POP_DANCE_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_REQUESTED_HITS_PACK = GLOBAL_REQUESTED_HITS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_SPANISH_REQUESTED_HITS_PACK = GLOBAL_SPANISH_REQUESTED_HITS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_LATIN_CURRENT_REQUESTED_PACK = GLOBAL_LATIN_CURRENT_REQUESTED_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_PARTY_LATIN_REQUESTED_PACK = GLOBAL_PARTY_LATIN_REQUESTED_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_DIVAS_POP_REQUESTED_PACK = GLOBAL_DIVAS_POP_REQUESTED_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const GLOBAL_CODEX_SUGGESTIONS_PACK = GLOBAL_CODEX_SUGGESTIONS_PACK_ROWS.map(
  parseGlobalHitPackTrack,
);

const OT_PACK_ID = "ot-2017-2018-2020-2023-2025-66";

const OT_PACK_ROWS = [
  "track-lo-malo|Lo malo|Aitana y Ana Guerra|2018|https://www.youtube.com/watch?v=l0CHGEoSz4c|OT 2017|Gala Eurovisión|Ninguna de las dos",
  "track-tu-cancion|Tu canción|Amaia y Alfred|2018|https://www.youtube.com/watch?v=5gb_OdvTnic|OT 2017|Gala Eurovisión|Ninguno de los dos",
  "ot-2017-city-of-stars|City Of Stars|Amaia y Alfred|2017|https://www.youtube.com/watch?v=_k-oIhNLHxM|OT 2017|Gala 3|Pendiente de revisar",
  "ot-2017-shake-it-out|Shake It Out|Amaia|2018|https://www.youtube.com/watch?v=I7LsENVJdK0|OT 2017|Gala 9|Pendiente de revisar",
  "ot-2017-miedo|Miedo|Amaia|2018|https://www.youtube.com/watch?v=2XGmZBacTDo|OT 2017|OT Final|Pendiente de revisar",
  "ot-2017-no-puedo-vivir-sin-ti|No puedo vivir sin ti|Aitana y Cepeda|2018|https://www.youtube.com/watch?v=kqJw9wdZ_ng|OT 2017|OT Fiesta|Pendiente de revisar",
  "ot-2017-la-bikina|La Bikina|Ana Guerra|2018|https://www.youtube.com/watch?v=HMwzN2_UaWk|OT 2017|Gala 11|Pendiente de revisar",
  "ot-2017-chandelier|Chandelier|Aitana|2018|https://www.youtube.com/watch?v=GbLj2nEo688|OT 2017|OT Final|Pendiente de revisar",
  "ot-2017-issues|Issues|Aitana|2017|https://www.youtube.com/watch?v=75Wh36GRlEk|OT 2017|Gala 3|Pendiente de revisar",
  "ot-2017-shape-of-you|Shape Of You|Roi y Amaia|2018|https://www.youtube.com/watch?v=ONjhCmvUe5I|OT 2017|OT Fiesta|Pendiente de revisar",
  "ot-2017-camina|Camina|Operación Triunfo 2017|2017|https://www.youtube.com/watch?v=aUytNRYG6KE|OT 2017|Gala Navidad|Pendiente de revisar",
  "ot-2017-la-llamada|La llamada|Roi|2017|https://www.youtube.com/watch?v=Wr_wZJ2Eiow|OT 2017|Gala 6|Pendiente de revisar",
  "ot-2017-con-las-ganas|Con las ganas|Amaia y Aitana|2018|https://www.youtube.com/watch?v=bmBCW-bh4Uw|OT 2017|Gala 12|Pendiente de revisar",
  "ot-2017-eloise|Eloise|Agoney|2018|https://www.youtube.com/watch?v=6NI6UOKNzDE|OT 2017|Gala 11|Pendiente de revisar",
  "ot-2017-what-about-us|What About Us|Miriam|2018|https://www.youtube.com/watch?v=RhvDDQtP6wI|OT 2017|Gala 11|Pendiente de revisar",
  "ot-2018-shallow|Shallow|Natalia y Miki|2018|https://www.youtube.com/watch?v=fzxs-u1Mxrg|OT 2018|Gala 6|Pendiente de revisar",
  "ot-2018-uptown-funk|Uptown Funk|Famous|2018|https://www.youtube.com/watch?v=r9zndKDYBGQ|OT 2018|Gala 10|Pendiente de revisar",
  "ot-2018-la-llorona|La Llorona|Alba Reche|2018|https://www.youtube.com/watch?v=hrpWRTC692o|OT 2018|Gala 6|Pendiente de revisar",
  "ot-2018-creep|Creep|Alba Reche|2018|https://www.youtube.com/watch?v=UmiYoN531fk|OT 2018|OT Final|Pendiente de revisar",
  "ot-2018-never-enough|Never Enough|Natalia|2018|https://www.youtube.com/watch?v=OEd2nYELPUE|OT 2018|OT Final|Pendiente de revisar",
  "ot-2018-tris-tras|Tris Tras|Sabela|2018|https://www.youtube.com/watch?v=iy5FiN5J0pk|OT 2018|OT Final|Pendiente de revisar",
  "ot-2018-and-i-am-telling-you|And I Am Telling You I'm Not Going|Famous|2018|https://www.youtube.com/watch?v=hyHkB271nQg|OT 2018|OT Final|Pendiente de revisar",
  "ot-2018-la-venda|La venda|Miki|2019|https://www.youtube.com/watch?v=1JLtDWvIXNY|OT 2018|Gala Eurovisión|Pendiente de revisar",
  "ot-2018-muerdeme|Muérdeme|María|2019|https://www.youtube.com/watch?v=925u5KKgAPo|OT 2018|Gala Eurovisión|Pendiente de revisar",
  "ot-2018-fast-car|Fast Car|Famous y Alba Reche|2018|https://www.youtube.com/watch?v=0jH68huo66c|OT 2018|Gala 5|Pendiente de revisar",
  "ot-2020-8-maravillas|8 maravillas|Nia|2020|https://www.youtube.com/watch?v=WBIP7asM_hQ|OT 2020|Gala Final|Pendiente de revisar",
  "ot-2020-que-sabra-neruda|Qué sabrá Neruda|Javy Ramírez|2020|https://www.youtube.com/watch?v=mvEETcclzf8|OT 2020|Post OT / single|Pendiente de revisar",
  "ot-2020-la-despedida|La despedida|Nia y Gèrard|2020|https://www.youtube.com/watch?v=ADi5_kLtdHI|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-maniac|Maniac|Samantha y Eva|2020|https://www.youtube.com/watch?v=iKsQ3F_6G30|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-senorita|Señorita|Anajú y Hugo|2020|https://www.youtube.com/watch?v=tvdPx8vflFc|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-semilla-negra|Semilla negra|Maialen y Nick|2020|https://www.youtube.com/watch?v=Q2xVqx5jFPM|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-tu-frialdad|Tu frialdad|Jesús y Javy|2020|https://www.youtube.com/watch?v=zWjWbats_w8|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-podria-ser-peor|Podría ser peor|Anne y Bruno|2020|https://www.youtube.com/watch?v=nhqJshgT6Ho|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-shotgun|Shotgun|Flavio|2020|https://www.youtube.com/watch?v=5K8Yk_hUDeQ|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2020-sentimiento-de-caoba|Sentimiento de caoba|Rafa|2020|https://www.youtube.com/watch?v=2c_jvIPe_gA|OT 2020|Gala 3|Pendiente de revisar",
  "ot-2023-libertad|Libertad|Operación Triunfo 2023|2023|https://www.youtube.com/watch?v=E610YfoEi4s|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-padam-padam|Padam Padam|Denna y Violeta|2023|https://www.youtube.com/watch?v=H4BEFTx2iUg|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-inmortal|Inmortal|Ruslana y Martin|2023|https://www.youtube.com/watch?v=GpxpRTneXqQ|OT 2023|Gala 3|Pendiente de revisar",
  "ot-2023-a-tu-vera|A tu vera|Salma y Juanjo|2023|https://www.youtube.com/watch?v=o7batv_tRaw|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-tomame-o-dejame|Tómame o déjame|Naiara|2023|https://www.youtube.com/watch?v=trPYWe8i9iw|OT 2023|Gala 3|Pendiente de revisar",
  "ot-2023-tiroteo|Tiroteo|Martin y Álex Márquez|2023|https://www.youtube.com/watch?v=CpboL9InacI|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-la-vida-moderna|La vida moderna|Juanjo Bona y Paul Thin|2023|https://www.youtube.com/watch?v=4eEYiHvbXxg|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-i-kissed-a-girl|I Kissed A Girl|Chiara y Violeta|2023|https://www.youtube.com/watch?v=iehemejing0|OT 2023|Gala 1|Pendiente de revisar",
  "ot-2023-slomo|SloMo|Ruslana|2023|https://www.youtube.com/watch?v=smvqIf0ft2k|OT 2023|Gala 5|Pendiente de revisar",
  "ot-2023-salvaje|Salvaje|Ruslana y Naiara|2023|https://www.youtube.com/watch?v=SWBkIr19MXY|OT 2023|Gala 4|Pendiente de revisar",
  "ot-2023-god-only-knows|God Only Knows|Martin y Juanjo|2023|https://www.youtube.com/watch?v=J1Ol8pdPK0Y|OT 2023|Gala 4|Pendiente de revisar",
  "ot-2023-sweet-caroline|Sweet Caroline|Operación Triunfo 2023|2023|https://www.youtube.com/watch?v=dQa5AFHi_fI|OT 2023|Gala 4|Pendiente de revisar",
  "ot-2023-sobrevivire|Sobreviviré|Naiara|2023|https://www.youtube.com/watch?v=ISKVG59j6_U|OT 2023|Gala Final|Pendiente de revisar",
  "ot-2023-way-down-we-go|Way Down We Go|Paul Thin|2023|https://www.youtube.com/watch?v=rzwaxK_RrNo|OT 2023|Gala Final|Pendiente de revisar",
  "ot-2023-zombie|Zombie|Ruslana|2023|https://www.youtube.com/watch?v=ujvN7EqNPpI|OT 2023|Gala Final|Pendiente de revisar",
  "ot-2025-ese-lugar|Ese lugar|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=kKp_YQFH-To|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-yo-quiero-bailar|Yo quiero bailar|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=MoqyiYetHAY|OT 2025|Gala 1|Pendiente de revisar",
  "ot-2025-voy-a-pasarmelo-bien|Voy a pasármelo bien|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=5U4iuLtTB2s|OT 2025|Gala 11|Pendiente de revisar",
  "ot-2025-saturno|Saturno|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=LXXAxyNm5PI|OT 2025|Gala 10 / single|Pendiente de revisar",
  "ot-2025-sera-porque-te-amo|Será porque te amo|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=vrCLn6UPmGI|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-potra-salvaje|Potra salvaje|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=4JpWr3jXqFE|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-que-nada-nos-pare|Que nada nos pare (Lo más importante)|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=nh18w9JsGdE|OT 2025|Gala 8|Pendiente de revisar",
  "ot-2025-mi-nombre|Mi nombre|Operación Triunfo 2025 y Leire Martínez|2025|https://www.youtube.com/watch?v=a--NzwStG_o|OT 2025|Gala 5 / single|Pendiente de revisar",
  "ot-2025-make-your-own-kind-of-music|Make Your Own Kind Of Music|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=0WrdgEnov3M|OT 2025|Gala 6 / single|Pendiente de revisar",
  "ot-2025-todo-ira-bien|Todo irá bien|Operación Triunfo 2025 y Chenoa|2025|https://www.youtube.com/watch?v=zg1dAAbtyj0|OT 2025|Gala 12|Pendiente de revisar",
  "ot-2025-marta-sebas-guille|Marta, Sebas, Guille y los demás|Operación Triunfo 2025|2025|https://www.youtube.com/watch?v=dC1G3cze8qo|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-la-noia|La noia|Cris Lora|2025|https://www.youtube.com/watch?v=-_LNHkm8u_A|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-vivir-asi-es-morir-de-amor|Vivir así es morir de amor|Claudia Arenas|2025|https://www.youtube.com/watch?v=USiSxpKo2vE|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-lose-control|Lose Control|Tinho Vaamonde|2025|https://www.youtube.com/watch?v=4M-CrdfRtuE|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-break-free|Break Free|Olivia Bay|2025|https://www.youtube.com/watch?v=7h8ma6jseR4|OT 2025|Gala Final|Pendiente de revisar",
  "ot-2025-cuanto-me-duele|Cuánto me duele|Guille Toledano|2025|https://www.youtube.com/watch?v=vbkc3WcLcWg|OT 2025|Gala Final / ensayo inédito|Pendiente de revisar",
] as const;

const OT_EXTRA_PACK_ID = "ot-iconicas-extra-2026-08-15-118";

const OT_EXTRA_PACK_ROWS = [
  "ot-extra-2017-bang-bang-aitana|Bang Bang|Aitana|2018|https://www.youtube.com/watch?v=mbq6DtTd5jQ|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-starman-amaia|Starman|Amaia|2018|https://www.youtube.com/watch?v=m4RIXLqGeFw|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-no-te-pude-retener-miriam|No te pude retener|Miriam|2018|https://www.youtube.com/watch?v=USWa1hcjW94|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-invisible-miriam|Invisible|Miriam|2018|https://www.youtube.com/watch?v=5k5TGI3lNF0|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-dont-stop-the-music-alfred|Don't Stop The Music|Alfred|2018|https://www.youtube.com/watch?v=wLGf6EY1ODg|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-volver-ana-guerra|Volver|Ana Guerra|2018|https://www.youtube.com/watch?v=cpBBSUXJl_E|OT 2017|OT Final|Pendiente de revisar",
  "ot-extra-2017-la-revolucion-sexual|La revolución sexual|Operación Triunfo 2017|2017|https://www.youtube.com/watch?v=S3wWC67bGVA|OT 2017|Gala 5|Pendiente de revisar",
  "ot-extra-2017-dont-you-worry-bout-a-thing|Don't You Worry 'Bout A Thing|Mimi y Ana Guerra|2017|https://www.youtube.com/watch?v=yd39Ed_NSgI|OT 2017|Gala 1|Pendiente de revisar",
  "ot-extra-2017-a-yo-mimi|A-Yo|Mimi|2017|https://www.youtube.com/watch?v=OZsy4o0ix3g|OT 2017|Gala 2|Pendiente de revisar",
  "ot-extra-2017-dont-cha-mimi|Don't Cha|Mimi|2017|https://www.youtube.com/watch?v=o-aWRzoSTug|OT 2017|Gala 0|Pendiente de revisar",
  "ot-extra-2017-madre-tierra|Madre Tierra|Ricky y Mireya|2017|https://www.youtube.com/watch?v=uAptDMi3bzU|OT 2017|Gala 4|Pendiente de revisar",
  "ot-extra-2017-la-quiero-a-morir|La quiero a morir|Mireya y Raoul|2017|https://www.youtube.com/watch?v=I4tANEh0C-I|OT 2017|Gala 3|Pendiente de revisar",
  "ot-extra-2017-ni-un-paso-atras|Ni un paso atrás|Mireya|2017|https://www.youtube.com/watch?v=wiGMGjuSxx4|OT 2017|Gala 7|Pendiente de revisar",
  "ot-extra-2017-cuando-nadie-me-ve|Cuando nadie me ve|Mireya|2017|https://www.youtube.com/watch?v=jpZczEZ3hwI|OT 2017|Gala 5|Pendiente de revisar",
  "ot-extra-2017-corre|Corre|Mireya y Juan Antonio|2017|https://www.youtube.com/watch?v=UmC6Sa6365o|OT 2017|Gala 1|Pendiente de revisar",
  "ot-extra-2017-sentir|Sentir|Mireya y Marina|2017|https://www.youtube.com/watch?v=wGgnXSjHN60|OT 2017|Gala 2|Pendiente de revisar",
  "ot-extra-2017-complicidad|Complicidad|Marina y Cepeda|2017|https://www.youtube.com/watch?v=r4SRcqII0bM|OT 2017|Gala 3|Pendiente de revisar",
  "ot-extra-2017-everytime-you-go-away|Everytime You Go Away|Alfred y Raoul|2017|https://www.youtube.com/watch?v=4SaIGSBV5TY|OT 2017|Gala 2|Pendiente de revisar",
  "ot-extra-2017-amar-pelos-dois|Amar pelos dois|Alfred|2017|https://www.youtube.com/watch?v=-XswOUMP83g|OT 2017|Gala 4|Pendiente de revisar",
  "ot-extra-2017-vencer-al-amor|Vencer al amor|Cepeda|2017|https://www.youtube.com/watch?v=kNgDTvIMZY4|OT 2017|Gala 8|Pendiente de revisar",
  "ot-extra-2017-say-you-wont-let-go|Say You Won't Let Go|Cepeda|2018|https://www.youtube.com/watch?v=BIB3ZGWwqkg|OT 2017|Gala 9|Pendiente de revisar",
  "ot-extra-2017-symphony|Symphony|Nerea y Agoney|2017|https://www.youtube.com/watch?v=7DMpE1lJGMY|OT 2017|Gala 4|Pendiente de revisar",
  "ot-extra-2017-quedate-conmigo-nerea|Quédate conmigo|Nerea|2017|https://www.youtube.com/watch?v=wHtw2Oz4c5E|OT 2017|Gala 6|Pendiente de revisar",
  "ot-extra-2017-where-have-you-been|Where Have You Been|Agoney|2018|https://www.youtube.com/watch?v=by3UsB8jO-Y|OT 2017|Gala 12|Pendiente de revisar",
  "ot-extra-2017-havana|Havana|Ana Guerra|2018|https://www.youtube.com/watch?v=0mMU1TjDHSk|OT 2017|Gala 12|Pendiente de revisar",
  "ot-extra-2017-procuro-olvidarte|Procuro olvidarte|Aitana|2018|https://www.youtube.com/watch?v=TmrORaHbBO8|OT 2017|Gala 11|Pendiente de revisar",
  "ot-extra-2017-lejos-de-tu-piel|Lejos de tu piel|Miriam|2018|https://www.youtube.com/watch?v=lmMJF8hBj4U|OT 2017|Gala Eurovisión|Pendiente de revisar",
  "ot-extra-2017-love-on-the-brain|Love On The Brain|Amaia|2018|https://www.youtube.com/watch?v=vVQShQ3MKnQ|OT 2017|Gala 11|Pendiente de revisar",
  "ot-extra-2017-sonar-contigo|Soñar contigo|Amaia|2018|https://www.youtube.com/watch?v=TqOwb--Mf-k|OT 2017|Gala 10|Pendiente de revisar",
  "ot-extra-2017-te-recuerdo-amanda|Te recuerdo Amanda|Amaia|2018|https://www.youtube.com/watch?v=6h6Rvey-4Y8|OT 2017|Gala 12|Pendiente de revisar",
  "ot-extra-2017-demons|Demons|Roi|2018|https://www.youtube.com/watch?v=P0nvKwlpnVc|OT 2017|Gala 10|Pendiente de revisar",
  "ot-extra-2017-when-i-was-your-man|When I Was Your Man|Roi|2018|https://www.youtube.com/watch?v=oyv6LKk2pqc|OT 2017|Gala 9|Pendiente de revisar",
  "ot-extra-2017-heaven|Heaven|Roi|2018|https://www.youtube.com/watch?v=Afjz5v8Hy_U|OT 2017|Gala 11|Pendiente de revisar",
  "ot-extra-2017-dramas-y-comedias|Dramas y comedias|Miriam|2018|https://www.youtube.com/watch?v=TEzEhH_plis|OT 2017|Gala 9|Pendiente de revisar",
  "ot-extra-2017-i-wanna-dance-with-somebody|I Wanna Dance With Somebody|Miriam|2018|https://www.youtube.com/watch?v=Q_YUfCmBPVk|OT 2017|Gala 8|Pendiente de revisar",
  "ot-extra-2017-recuerdame|Recuérdame|Miriam|2018|https://www.youtube.com/watch?v=IumlTGWf0pI|OT 2017|Gala 12|Pendiente de revisar",
  "ot-extra-2017-solo-si-es-contigo|Solo si es contigo|Alfred, Aitana y Ana Guerra|2018|https://www.youtube.com/watch?v=9SUSAEde6KY|OT 2017|Gala 10|Pendiente de revisar",
  "ot-extra-2017-a-quien-le-importa|A quién le importa|Operación Triunfo 2017|2017|https://www.youtube.com/watch?v=hoH6OXQpmQY|OT 2017|Gala 7|Pendiente de revisar",
  "ot-extra-2017-so-what|So What|Amaia|2017|https://www.youtube.com/watch?v=VgnWpsnBDQM|OT 2017|Gala 6|Pendiente de revisar",
  "ot-extra-2017-let-me-entertain-you|Let Me Entertain You|Ricky|2017|https://www.youtube.com/watch?v=pwbpmsOEDOc|OT 2017|Gala 6|Pendiente de revisar",
  "ot-extra-2017-cheap-thrills|Cheap Thrills|Aitana|2018|https://www.youtube.com/watch?v=sGIJZjc_0I8|OT 2017|Gala 10|Pendiente de revisar",
  "ot-extra-2017-the-time-of-my-life|The Time Of My Life|Ricky y Nerea|2017|https://www.youtube.com/watch?v=ldXNxck2YkE|OT 2017|Gala 5|Pendiente de revisar",
  "ot-extra-2017-dancing-in-the-moonlight|Dancing In The Moonlight|Marina y Raoul|2017|https://www.youtube.com/watch?v=YJtMiChk-qo|OT 2017|Gala 4|Pendiente de revisar",
  "ot-extra-2018-toxic|Toxic|Natalia y Alba Reche|2018|https://www.youtube.com/watch?v=zgI5QKNmO2s|OT 2018|Gala 4|Pendiente de revisar",
  "ot-extra-2018-bang-bang-natalia|Bang Bang|Natalia|2018|https://www.youtube.com/watch?v=GP3K64rOmKE|OT 2018|Gala 11|Pendiente de revisar",
  "ot-extra-2018-crazy|Crazy|Natalia|2018|https://www.youtube.com/watch?v=a6CZQsUczrs|OT 2018|Gala Final|Pendiente de revisar",
  "ot-extra-2018-pienso-en-tu-mira|Pienso en tu mirá|Julia y Natalia|2018|https://www.youtube.com/watch?v=DVivrI3UUCY|OT 2018|Gala 5|Pendiente de revisar",
  "ot-extra-2018-the-scientist|The Scientist|Natalia|2018|https://www.youtube.com/watch?v=5QCWU1umKII|OT 2018|Gala 10|Pendiente de revisar",
  "ot-extra-2018-dangerous-woman|Dangerous Woman|Alba Reche|2018|https://www.youtube.com/watch?v=deBO25yNzDA|OT 2018|Gala Final|Pendiente de revisar",
  "ot-extra-2018-she-used-to-be-mine|She Used To Be Mine|Alba Reche|2018|https://www.youtube.com/watch?v=VsIzivxx5JQ|OT 2018|Gala 12|Pendiente de revisar",
  "ot-extra-2018-this-is-me|This Is Me|Operación Triunfo 2018|2018|https://www.youtube.com/watch?v=C18TZmMbVz4|OT 2018|Gala 1|Pendiente de revisar",
  "ot-extra-2018-faith|Faith|Famous|2018|https://www.youtube.com/watch?v=91FULVK-XD0|OT 2018|Gala 0|Pendiente de revisar",
  "ot-extra-2018-take-me-to-church|Take Me To Church|Famous|2018|https://www.youtube.com/watch?v=qT35APf7Xdw|OT 2018|Gala 4|Pendiente de revisar",
  "ot-extra-2018-el-patio|El patio|Miki|2018|https://www.youtube.com/watch?v=Vk7d4ulh-DE|OT 2018|Gala 5|Pendiente de revisar",
  "ot-extra-2018-can-we-dance|Can We Dance|Miki|2018|https://www.youtube.com/watch?v=02bLbHb3H5A|OT 2018|Gala 8|Pendiente de revisar",
  "ot-extra-2018-90-minutos|90 minutos|Julia|2018|https://www.youtube.com/watch?v=OGHjSYAcTcU|OT 2018|Gala 8|Pendiente de revisar",
  "ot-extra-2018-dejame-ser|Déjame ser|Julia|2018|https://www.youtube.com/watch?v=EBwO70sm8sA|OT 2018|Gala Final|Pendiente de revisar",
  "ot-extra-2018-vuelves|Vuelves|Julia|2018|https://www.youtube.com/watch?v=hXcZv-OPO9M|OT 2018|Gala 0|Pendiente de revisar",
  "ot-extra-2018-amorfoda|Amorfoda|María|2018|https://www.youtube.com/watch?v=3oqTngckm9s|OT 2018|Gala 9|Pendiente de revisar",
  "ot-extra-2018-y-nos-dieron-las-diez|Y nos dieron las diez|Marta|2018|https://www.youtube.com/watch?v=Alc8w_9o94o|OT 2018|Gala 5|Pendiente de revisar",
  "ot-extra-2018-one-more-try|One More Try|Marta|2018|https://www.youtube.com/watch?v=MaqN28fl6OE|OT 2018|Gala 11|Pendiente de revisar",
  "ot-extra-2018-leave-me-alone|Leave Me Alone|Marta|2018|https://www.youtube.com/watch?v=Zt9f8SAiAjM|OT 2018|Gala 6|Pendiente de revisar",
  "ot-extra-2018-el-cuarto-de-tula|El cuarto de Tula|Sabela|2018|https://www.youtube.com/watch?v=VITHHUgHhns|OT 2018|Gala 11|Pendiente de revisar",
  "ot-extra-2018-bachata-rosa|Bachata rosa|Sabela|2018|https://www.youtube.com/watch?v=XhJK6HSK3Hw|OT 2018|Gala 0|Pendiente de revisar",
  "ot-extra-2018-hasta-la-raiz|Hasta la raíz|Marilia|2018|https://www.youtube.com/watch?v=OaAAkL3D0Ik|OT 2018|Gala 8|Pendiente de revisar",
  "ot-extra-2018-rather-be|Rather Be|Marilia|2018|https://www.youtube.com/watch?v=BGc42dk_bd4|OT 2018|Gala 5|Pendiente de revisar",
  "ot-extra-2018-river|River|Noelia|2018|https://www.youtube.com/watch?v=Ses3aixp1Zk|OT 2018|Gala 0|Pendiente de revisar",
  "ot-extra-2018-stone-cold|Stone Cold|Noelia|2018|https://www.youtube.com/watch?v=aEoEDM6obS8|OT 2018|Gala 7|Pendiente de revisar",
  "ot-extra-2018-sea|Sea|Dave|2018|https://www.youtube.com/watch?v=wGiXO_o04QI|OT 2018|Gala 0|Pendiente de revisar",
  "ot-extra-2018-creeme|Créeme|Dave|2018|https://www.youtube.com/watch?v=zu-QhFRKK_M|OT 2018|Gala 5|Pendiente de revisar",
  "ot-extra-2018-september|September|Famous y Marta|2018|https://www.youtube.com/watch?v=eJNKUkqefK8|OT 2018|Gala 8|Pendiente de revisar",
  "ot-extra-2018-este-amor-ya-no-se-toca|Este amor ya no se toca|Alba Reche, Julia y Natalia|2018|https://www.youtube.com/watch?v=-aKRTxCgSHw|OT 2018|Gala 12|Pendiente de revisar",
  "ot-extra-2018-feel-it-still|Feel It Still|Famous y Natalia|2018|https://www.youtube.com/watch?v=_YmGR5pGVII|OT 2018|Gala 1|Pendiente de revisar",
  "ot-extra-2018-tainted-love|Tainted Love|Marta y Natalia|2018|https://www.youtube.com/watch?v=Oh494wgyZds|OT 2018|Gala 2|Pendiente de revisar",
  "ot-extra-2018-respect|Respect|Alba Reche y Noelia|2018|https://www.youtube.com/watch?v=IMYmRR1uHxs|OT 2018|Gala 1|Pendiente de revisar",
  "ot-extra-2018-voy-en-un-coche|Voy en un coche|María|2018|https://www.youtube.com/watch?v=tdq7595wR5c|OT 2018|Gala 7|Pendiente de revisar",
  "ot-extra-2018-una-lluna-a-laigua|Una lluna a l'aigua|Miki|2018|https://www.youtube.com/watch?v=0STuW040vdY|OT 2018|Gala 9|Pendiente de revisar",
  "ot-extra-2018-123|1,2,3|Famous y María|2018|https://www.youtube.com/watch?v=IyDedWrPavU|OT 2018|Gala 6|Pendiente de revisar",
  "ot-extra-2018-la-tormenta|La tormenta|Noelia|2018|https://www.youtube.com/watch?v=XTy4cH-39us|OT 2018|Gala 4|Pendiente de revisar",
  "ot-extra-2018-negro-caravel|Negro caravel|Sabela|2018|https://www.youtube.com/watch?v=btvzdOdYUJQ|OT 2018|Gala 12|Pendiente de revisar",
  "ot-extra-2020-diselo-a-la-vida|Díselo a la vida|Operación Triunfo 2020|2020|https://www.youtube.com/watch?v=oo34zcfvG5s|OT 2020|Gala Final|Pendiente de revisar",
  "ot-extra-2020-tusa|Tusa|Anajú|2020|https://www.youtube.com/watch?v=zaB6UAa-rZk|OT 2020|Gala 7|Pendiente de revisar",
  "ot-extra-2020-guantanamera|Guantanamera|Anajú y Nia|2020|https://www.youtube.com/watch?v=5fA0FIVml6w|OT 2020|Gala 2|Pendiente de revisar",
  "ot-extra-2020-run-the-world|Run The World (Girls)|Nia|2020|https://www.youtube.com/watch?v=0yo1ebfOvKU|OT 2020|Gala 5|Pendiente de revisar",
  "ot-extra-2020-mujer-latina|Mujer latina|Nia|2020|https://www.youtube.com/watch?v=DyiRaj35Idc|OT 2020|Gala 8|Pendiente de revisar",
  "ot-extra-2020-bad-girls|Bad Girls|Nia y Bruno|2020|https://www.youtube.com/watch?v=p8xuom-WMDU|OT 2020|Gala 4|Pendiente de revisar",
  "ot-extra-2020-say-something|Say Something|Nia|2020|https://www.youtube.com/watch?v=IOG9JrzqXto|OT 2020|Gala Final|Pendiente de revisar",
  "ot-extra-2020-vas-a-quedarte|Vas a quedarte|Samantha y Hugo|2020|https://www.youtube.com/watch?v=I2yGt4gGyJg|OT 2020|Gala 5|Pendiente de revisar",
  "ot-extra-2020-milionaria|Milionària|Samantha|2020|https://www.youtube.com/watch?v=qL7s0b2klpA|OT 2020|Gala 9|Pendiente de revisar",
  "ot-extra-2020-suenos-rotos|Sueños rotos|Samantha|2020|https://www.youtube.com/watch?v=UHKzjPciuys|OT 2020|Gala 10|Pendiente de revisar",
  "ot-extra-2020-call-me-maybe|Call Me Maybe|Flavio y Samantha|2020|https://www.youtube.com/watch?v=Ijy3iR74LcE|OT 2020|Gala 4|Pendiente de revisar",
  "ot-extra-2020-death-of-a-bachelor|Death Of A Bachelor|Flavio|2020|https://www.youtube.com/watch?v=62fGVHYZyzc|OT 2020|Gala Final|Pendiente de revisar",
  "ot-extra-2020-thats-life|That's Life|Flavio|2020|https://www.youtube.com/watch?v=JFbXIbBSjtI|OT 2020|Gala 6|Pendiente de revisar",
  "ot-extra-2020-human|Human|Flavio|2020|https://www.youtube.com/watch?v=5QNkwTy3pRs|OT 2020|Gala 10|Pendiente de revisar",
  "ot-extra-2020-7-rings|7 Rings|Anajú|2020|https://www.youtube.com/watch?v=6ig6LKzkiCU|OT 2020|Gala Final|Pendiente de revisar",
  "ot-extra-2020-wicked-game|Wicked Game|Gèrard y Anne|2020|https://www.youtube.com/watch?v=kKQpvuxEcgA|OT 2020|Gala 4|Pendiente de revisar",
  "ot-extra-2020-the-loco-motion|The Loco-Motion|Eva y Gèrard|2020|https://www.youtube.com/watch?v=yDg3d91LSFE|OT 2020|Gala 6|Pendiente de revisar",
  "ot-extra-2020-this-is-the-last-time|This Is The Last Time|Gèrard|2020|https://www.youtube.com/watch?v=bhK9fMlKPx0|OT 2020|Gala 0|Pendiente de revisar",
  "ot-extra-2023-i-love-rock-n-roll|I Love Rock N Roll|Ruslana|2023|https://www.youtube.com/watch?v=AVYmf37c608|OT 2023|Gala 0|Pendiente de revisar",
  "ot-extra-2023-de-musica-ligera|De música ligera|Lucas|2023|https://www.youtube.com/watch?v=2zUyKP43Dn0|OT 2023|Gala 0|Pendiente de revisar",
  "ot-extra-2023-me-muero|Me muero|Naiara|2023|https://www.youtube.com/watch?v=eTOVWc0-LbE|OT 2023|Gala 0|Pendiente de revisar",
  "ot-extra-2023-baby-hello|Baby Hello|Paul Thin|2023|https://www.youtube.com/watch?v=tdG6be7FP_k|OT 2023|Gala Final|Pendiente de revisar",
  "ot-extra-2023-pillowtalk|Pillowtalk|Lucas|2023|https://www.youtube.com/watch?v=h_MwPEncQq8|OT 2023|Gala Final|Pendiente de revisar",
  "ot-extra-2023-es-por-ti|Es por ti|Violeta|2023|https://www.youtube.com/watch?v=-jKznH2_8Xg|OT 2023|Gala 4|Pendiente de revisar",
  "ot-extra-2023-dragon|Dragón|Denna|2023|https://www.youtube.com/watch?v=V7czq1jBC2M|OT 2023|Gala 4|Pendiente de revisar",
  "ot-extra-2023-peces-de-ciudad|Peces de ciudad|Bea|2023|https://www.youtube.com/watch?v=w_n4-nQYdnQ|OT 2023|Gala 4|Pendiente de revisar",
  "ot-extra-2023-i-drove-all-night|I Drove All Night|Álvaro Mayo y Cris|2023|https://www.youtube.com/watch?v=8A-9pU6mwvk|OT 2023|Gala 4|Pendiente de revisar",
  "ot-extra-2023-perreo-bonito|Perreo bonito|Lucas, Chiara y Álex Márquez|2023|https://www.youtube.com/watch?v=HnOxEdgUTRI|OT 2023|Gala 4|Pendiente de revisar",
  "ot-extra-2025-say-my-name|Say My Name|Guillo Rist|2025|https://www.youtube.com/watch?v=1U7MZG1Qm5k|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-palabra-prohibida|Palabra prohibida|Samuraï|2025|https://www.youtube.com/watch?v=EyWMFFaI3VE|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-yes-sir-i-can-boogie|Yes Sir, I Can Boogie|Claudia Arenas y Olivia|2025|https://www.youtube.com/watch?v=Dg0blsvYowM|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-tengo-todo-excepto-a-ti|Tengo todo excepto a ti|Guille Toledano|2025|https://www.youtube.com/watch?v=Y0RKA5pv2Ow|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-mamma-knows-best|Mamma Knows Best|Cristina|2025|https://www.youtube.com/watch?v=e3p58pMj6HE|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-mariposas|Mariposas|Cristina y Guille Toledano|2025|https://www.youtube.com/watch?v=oCWuIxCWcaY|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-el-cielo|El cielo|Claudia Arenas|2025|https://www.youtube.com/watch?v=kL7COSce4YY|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-tengo-un-pensamiento|Tengo un pensamiento|Olivia|2025|https://www.youtube.com/watch?v=2zdKOCuGWpA|OT 2025|Gala 12|Pendiente de revisar",
  "ot-extra-2025-wonder|Wonder|Guillo Rist|2025|https://www.youtube.com/watch?v=Q4cPbWq5x6I|OT 2025|Gala 11|Pendiente de revisar",
  "ot-extra-2025-im-outta-love|I'm Outta Love|Tinho|2025|https://www.youtube.com/watch?v=IGTZiGrM7IE|OT 2025|Gala 11|Pendiente de revisar",
] as const;

const OT_MORE_ICONIC_PACK_ID = "ot-iconicas-y-post-extra-2026-08-15-37";

const OT_MORE_ICONIC_PACK_ROWS = [
  "ot-more-2018-born-this-way-julia|Born This Way|Julia Medina|2018|https://www.youtube.com/watch?v=Y79jO1FAVtY|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-god-is-a-woman-africa|God Is a Woman|África Adalia|2018|https://www.youtube.com/watch?v=pu1ljm-sgUg|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-lo-siento-natalia-damion|Lo siento|Natalia Lacunza y Damion Frost|2018|https://www.youtube.com/watch?v=eo-n9QRrFLQ|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-just-give-me-a-reason-marta-alba|Just Give Me a Reason|Marta Sango y Alba Reche|2018|https://www.youtube.com/watch?v=fdyHbSIwdlE|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-what-a-fool-believes-famous-noelia|What a Fool Believes|Famous Oberogo y Noelia Franco|2018|https://www.youtube.com/watch?v=emFqWQb7JaI|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-viva-la-vida-grupal|Viva La Vida|Operación Triunfo 2018|2018|https://www.youtube.com/watch?v=ovIdkl9KRsY|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-mi-historia-entre-tus-dedos-julia-carlos|Mi historia entre tus dedos|Julia Medina y Carlos Right|2018|https://www.youtube.com/watch?v=bP1Wn49QFY0|OT 2018|Gala 2|Pendiente de revisar",
  "ot-more-2018-vuelvo-a-verte-joan-julia|Vuelvo a verte|Joan Garrido y Julia Medina|2018|https://www.youtube.com/watch?v=G4TZIsQheAI|OT 2018|Gala 1|Pendiente de revisar",
  "ot-more-2018-set-fire-to-the-rain-sabela|Set Fire to the Rain|Sabela|2018|https://www.youtube.com/watch?v=Egdd2Ljlsvs|OT 2018|Gala 6|Pendiente de revisar",
  "ot-more-2018-je-veux-alba-reche|Je veux|Alba Reche|2018|https://www.youtube.com/watch?v=KzlpZZGxG0c|OT 2018|Gala 8|Pendiente de revisar",
  "ot-more-2018-a-que-no-me-dejas-julia|A que no me dejas|Julia Medina|2018|https://www.youtube.com/watch?v=DxBO85X3UJk|OT 2018|Gala 10|Pendiente de revisar",
  "ot-more-2018-sober-julia|Sober|Julia Medina|2018|https://www.youtube.com/watch?v=uz4H-Qob73k|OT 2018|Gala 11|Pendiente de revisar",
  "ot-more-2018-ya-lo-sabes-julia|Ya lo sabes|Julia Medina|2018|https://www.youtube.com/watch?v=kWmRsDU6Lfk|OT 2018|Gala 12|Pendiente de revisar",
  "ot-more-2018-como-quieres-que-te-quiera-marilia-sabela|Cómo quieres que te quiera|Marilia y Sabela|2018|https://www.youtube.com/watch?v=qYQTw3O6Lfc|OT 2018|Gala 3|Pendiente de revisar",
  "ot-more-2018-exs-and-ohs-maria-noelia|Ex's & Oh's|María Escarmiento y Noelia Franco|2018|https://www.youtube.com/watch?v=7Yo4C_ax2zE|OT 2018|Gala 5|Pendiente de revisar",
  "ot-more-2018-quedate-en-madrid-miki-maria|Quédate en Madrid|Miki Núñez y María Escarmiento|2018|https://www.youtube.com/watch?v=CHU5mY72DOY|OT 2018|Gala 4|Pendiente de revisar",
  "ot-more-2018-alma-mia-miki-alba|Alma mía|Miki Núñez y Alba Reche|2018|https://www.youtube.com/watch?v=GETbdyUo-Sw|OT 2018|Gala 2|Pendiente de revisar",
  "ot-more-2018-only-girl-marilia|Only Girl (In The World)|Marilia|2018|https://www.youtube.com/watch?v=ddahmR-iBh4|OT 2018|Gala 9|Pendiente de revisar",
  "ot-more-2018-i-want-to-know-what-love-is-marta|I Want to Know What Love Is|Marta Sango|2018|https://www.youtube.com/watch?v=sWMgfG6_H8k|OT 2018|Gala 9|Pendiente de revisar",
  "ot-post-2017-ni-la-hora-ana-guerra|Ni La Hora|Ana Guerra y Juan Magán|2018|https://www.youtube.com/watch?v=OsAcF2APchM|OT 2017|Post|Post OT / single",
  "ot-post-2017-esta-vez-cepeda|Esta vez|Cepeda|2018|https://www.youtube.com/watch?v=ZGlHDAuN1tA|OT 2017|Post|Post OT / single",
  "ot-post-2017-hay-algo-en-mi-miriam|Hay algo en mí|Miriam Rodríguez|2018|https://www.youtube.com/watch?v=4VH3yW4GafQ|OT 2017|Post|Post OT / single",
  "ot-post-2017-y-ahora-no-nerea|Y ahora no|Nerea Rodríguez|2018|https://www.youtube.com/watch?v=RkUKsC1hPxs|OT 2017|Post|Post OT / single",
  "ot-post-2017-quizas-agoney|Quizás|Agoney|2018|https://www.youtube.com/watch?v=M2FcNd-8nVg|OT 2017|Post|Post OT / single",
  "ot-post-2017-un-nuevo-lugar-amaia|Un nuevo lugar|Amaia|2018|https://www.youtube.com/watch?v=CvPE353Cwj8|OT 2017|Post|Post OT / single",
  "ot-post-2017-de-la-tierra-hasta-marte-alfred|De la Tierra hasta Marte|Alfred García|2018|https://www.youtube.com/watch?v=ygwrTD34O8A|OT 2017|Post|Post OT / single",
  "ot-post-2018-medusa-alba-reche|Medusa|Alba Reche|2019|https://www.youtube.com/watch?v=te8l8FVp2j4|OT 2018|Post|Post OT / single",
  "ot-post-2018-nana-triste-natalia|nana triste|Natalia Lacunza y Guitarricadelafuente|2019|https://www.youtube.com/watch?v=roeMwMi66C8|OT 2018|Post|Post OT / single",
  "ot-post-2018-dime-julia-medina|Dime|Julia Medina|2019|https://www.youtube.com/watch?v=-1ex-g1Sr-c|OT 2018|Post|Post OT / single",
  "ot-post-2018-celebrate-miki|Celébrate|Miki Núñez|2019|https://www.youtube.com/watch?v=IgB056Q-HIs|OT 2018|Post|Post OT / single",
  "ot-post-2018-amargo-amor-maria|Amargo Amor|María Escarmiento|2019|https://www.youtube.com/watch?v=zuEKrd10Ijc|OT 2018|Post|Post OT / single",
  "ot-post-2018-por-ti-marta|Por Ti|Marta Sango|2019|https://www.youtube.com/watch?v=-s5YquWIPhM|OT 2018|Post|Post OT / single",
  "ot-post-2018-bulla-famous|Bulla|Famous Oberogo|2019|https://www.youtube.com/watch?v=j8Bil1C0KcA|OT 2018|Post|Post OT / single",
  "ot-post-2020-malayerba-nia|Malayerba|NIA|2020|https://www.youtube.com/watch?v=A3NCMhIzPgs|OT 2020|Post|Post OT / single",
  "ot-post-2020-dumb-eva|Dumb|Eva B|2020|https://www.youtube.com/watch?v=FDYbKwbT5y8|OT 2020|Post|Post OT / single",
  "ot-post-2020-calma-flavio|Calma|Flavio|2020|https://www.youtube.com/watch?v=ocUh8MuFfAM|OT 2020|Post|Post OT / single",
  "ot-post-2020-demonios-hugo|Demonios|Hugo Cobo|2020|https://www.youtube.com/watch?v=G3C2OOD3m08|OT 2020|Post|Post OT / single",
] as const;

const OT_2025_EXTRA_PACK_ID = "ot-2025-faltantes-extra-2026-08-15-40";

const OT_2025_EXTRA_PACK_ROWS = [
  "ot-2025-extra-ciudad-de-papel-judit|Ciudad de Papel|Judit Garuz|2025|https://www.youtube.com/watch?v=VP9GvnJGM0o|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-creo-en-mi-lucia|Creo En Mí|Lucia Casani|2025|https://www.youtube.com/watch?v=USLH38dmQek|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-papaoutai-teyou|Papaoutai|TÉYOU|2025|https://www.youtube.com/watch?v=Y3Rs-H5fTR8|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-i-was-born-to-love-you-guille-max|I Was Born To Love You|Guille Toledano y Max Navarro|2025|https://www.youtube.com/watch?v=3uYFNDXurxI|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-nada-valgo-sin-tu-amor-claudia-crespo|Nada Valgo Sin Tu Amor|Claudia Arenas y Crespo|2025|https://www.youtube.com/watch?v=9QDRY6Wg-oU|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-yes-and-maria-olivia|Yes, And?|María Cruz y Olivia Bay|2025|https://www.youtube.com/watch?v=zBsiB70uQJ4|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-i-wanna-be-your-slave-guillo-tinho|I Wanna Be Your Slave|Guillo Rist y Tinho Vaamonde|2025|https://www.youtube.com/watch?v=T6UncAggMsY|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-la-mala-costumbre-cris-laura|La Mala Costumbre|Cris Lora y Laura Muñoz|2025|https://www.youtube.com/watch?v=EKYgxh0ZHj8|OT 2025|Gala 5|Pendiente de revisar",
  "ot-2025-extra-latin-girl-claudia|Latin Girl|Claudia Arenas|2025|https://www.youtube.com/watch?v=R_0I9ZVWv6U|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-beautiful-things-tinho|Beautiful Things|Tinho Vaamonde|2025|https://www.youtube.com/watch?v=FRTDzRwpl9w|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-stars-guille|Stars|Guille Toledano|2025|https://www.youtube.com/watch?v=JkVyPf07jtA|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-fue-tan-poco-tu-carino-lucia|Fue Tan Poco Tu Cariño|Lucia Casani|2025|https://www.youtube.com/watch?v=4jMeE67SZVY|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-manchild-cris-olivia|Manchild|Cris Lora y Olivia Bay|2025|https://www.youtube.com/watch?v=73w7Y3k-ncw|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-super-vacio-teyou|Súper Vacío|TÉYOU|2025|https://www.youtube.com/watch?v=IFIJvj_HknU|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-hold-my-hand-crespo|Hold My Hand|Crespo|2025|https://www.youtube.com/watch?v=MhrxqGAnYCs|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-peregrino-guillo|Peregrino|Guillo Rist|2025|https://www.youtube.com/watch?v=fLvfQvbAqls|OT 2025|Gala 9|Pendiente de revisar",
  "ot-2025-extra-at-last-olivia|At Last|Olivia Bay|2025|https://www.youtube.com/watch?v=m0cWY1Ackpc|OT 2025|Gala 10|Pendiente de revisar",
  "ot-2025-extra-uh-nana-cris|UH NANA|Cris Lora|2025|https://www.youtube.com/watch?v=PqcbhhGjSxg|OT 2025|Gala 10|Pendiente de revisar",
  "ot-2025-extra-birds-of-a-feather-claudia|BIRDS OF A FEATHER|Claudia Arenas|2025|https://www.youtube.com/watch?v=Qfz7zIwA1nU|OT 2025|Gala 10|Pendiente de revisar",
  "ot-2025-extra-tempestades-de-sal-tinho|Tempestades de Sal|Tinho Vaamonde|2025|https://www.youtube.com/watch?v=clXWFGbJK9Q|OT 2025|Gala 10|Pendiente de revisar",
  "ot-2025-extra-until-i-found-you-guille|Until I Found You|Guille Toledano|2025|https://www.youtube.com/watch?v=a6gQPPn8RVk|OT 2025|Gala 10|Pendiente de revisar",
  "ot-2025-extra-el-principio-de-algo-guillo-olivia|El Principio de Algo|Guillo Rist y Olivia Bay|2025|https://www.youtube.com/watch?v=Ot8iwbn4DWA|OT 2025|Gala 6|Pendiente de revisar",
  "ot-2025-extra-je-me-casse-cris|Je Me Casse|Cris Lora|2025|https://www.youtube.com/watch?v=6Moj_CBNL1k|OT 2025|Gala 6|Pendiente de revisar",
  "ot-2025-extra-apt-guillo-cris|APT.|Guillo Rist y Cris Lora|2025|https://www.youtube.com/watch?v=Tq8qYiWE19s|OT 2025|Gala 1|Pendiente de revisar",
  "ot-2025-extra-end-of-the-world-claudia-cris|End Of The World|Claudia Arenas y Cris Lora|2025|https://www.youtube.com/watch?v=U1B2Ke_OgPo|OT 2025|Gala 7|Pendiente de revisar",
  "ot-2025-extra-dont-leave-me-this-way-guille-judit|Don't Leave Me This Way|Guille Toledano y Judit Garuz|2025|https://www.youtube.com/watch?v=ZxuI95AyMmc|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-extra-siempre-es-de-noche-guille-lucia|Siempre es de noche|Guille Toledano y Lucia Casani|2025|https://www.youtube.com/watch?v=fbfc4WpgSu4|OT 2025|Gala 7|Pendiente de revisar",
  "ot-2025-extra-akureyri-crespo-olivia|Akureyri|Crespo y Olivia Bay|2025|https://www.youtube.com/watch?v=DGmUKrU_Mu4|OT 2025|Gala 4|Pendiente de revisar",
  "ot-2025-extra-desatame-laura|Desátame|Laura Muñoz|2025|https://www.youtube.com/watch?v=q900delDptY|OT 2025|Gala 0|Pendiente de revisar",
  "ot-2025-extra-el-sitio-de-mi-recreo-claudia|El Sitio De Mi Recreo|Claudia Arenas|2025|https://www.youtube.com/watch?v=cBn1faP8nSs|OT 2025|Gala 2|Pendiente de revisar",
  "ot-2025-extra-tu-refugio-max|Tu Refugio|Max Navarro|2025|https://www.youtube.com/watch?v=wjkQNZuPB10|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-extra-lo-saben-mis-zapatos-salma|Lo Saben Mis Zapatos|Salma de Diego|2025|https://www.youtube.com/watch?v=EzSlkQjkBxY|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-extra-volar-carlos|Volar|Carlos de los Reyes|2025|https://www.youtube.com/watch?v=gtkxbasBu40|OT 2025|Gala 0|Pendiente de revisar",
  "ot-2025-extra-canijo-teyou-maria|Canijo|TÉYOU y María Cruz|2025|https://www.youtube.com/watch?v=GwtsWtUZNMM|OT 2025|Gala 1|Pendiente de revisar",
  "ot-2025-extra-el-unico-crespo-tinho|El Único|Crespo y Tinho Vaamonde|2025|https://www.youtube.com/watch?v=52hGnGdkdE0|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-extra-training-season-cris-lucia-maria|Training Season|Cris Lora, Lucia Casani y María Cruz|2025|https://www.youtube.com/watch?v=mbH-iC2l1rk|OT 2025|Gala 3|Pendiente de revisar",
  "ot-2025-extra-superestrella-olivia|Superestrella|Olivia Bay|2025|https://www.youtube.com/watch?v=t54oZS2J71M|OT 2025|Gala 7|Pendiente de revisar",
  "ot-2025-extra-i-like-the-way-you-kiss-me-olivia-ivan|I Like The Way You Kiss Me|Olivia Bay e Iván Rojo|2025|https://www.youtube.com/watch?v=6he78NXDnLg|OT 2025|Gala 1|Pendiente de revisar",
  "ot-2025-extra-its-my-life-ivan|It's My Life|Iván Rojo|2025|https://www.youtube.com/watch?v=mBwR-zfPAVg|OT 2025|Gala 2|Pendiente de revisar",
  "ot-2025-extra-agua-teyou-tinho|Agua|TÉYOU y Tinho Vaamonde|2025|https://www.youtube.com/watch?v=qXFeWtRhITE|OT 2025|Gala 6|Pendiente de revisar",
] as const;

function getOtEditionYear(extra: Partial<Record<GuessFieldId, string>>) {
  const match = extra.otEdition?.match(/\b(\d{4})\b/);
  const editionYear = match ? Number(match[1]) : NaN;

  return Number.isFinite(editionYear) ? editionYear : null;
}

function resolveTrackYear(
  mode: Track["mode"],
  year: number,
  extra: Partial<Record<GuessFieldId, string>>,
) {
  return mode === "OT" ? getOtEditionYear(extra) ?? year : year;
}

function parseOtPackTrack(row: string): Track {
  const [id, title, artist, year, youtubeUrl, otEdition, otGala, otNominations] =
    row.split("|");
  const extra = {
    otPerformers: artist,
    otEdition,
    otGala,
    otNominations,
  };
  const modes = normalizedTrackModes("OT", defaultModesForTrack("OT"), extra);

  return {
    id,
    title,
    artist,
    year: resolveTrackYear("OT", Number(year), extra),
    mode: "OT",
    modes: uniqueTrackModes(modes, "OT"),
    audioSrc: youtubeUrl,
    extra,
  };
}

const OT_PACK = OT_PACK_ROWS.map(parseOtPackTrack);
const OT_EXTRA_PACK = OT_EXTRA_PACK_ROWS.map(parseOtPackTrack);
const OT_MORE_ICONIC_PACK = OT_MORE_ICONIC_PACK_ROWS.map(parseOtPackTrack);
const OT_2025_EXTRA_PACK = OT_2025_EXTRA_PACK_ROWS.map(parseOtPackTrack);

const ANIME_PACK_ID = "anime-iconic-50-2026-08-15";

const ANIME_PACK_ROWS = [
  "anime-dragon-ball-makafushigi-adventure|Makafushigi Adventure!|Hiroki Takahashi|1986|https://www.youtube.com/watch?v=9kmRqi6cB-c|Dragon Ball|Opening|Serie original",
  "track-cha-la|CHA-LA HEAD-CHA-LA|Hironobu Kageyama|1989|https://www.youtube.com/watch?v=MFmIcjJdp38|Dragon Ball Z|Opening 1|Saiyan / Freezer",
  "anime-dragon-ball-we-gotta-power|WE GOTTA POWER|Hironobu Kageyama|1993|https://www.youtube.com/watch?v=bdiDfmoKH8M|Dragon Ball Z|Opening 2|Majin Buu",
  "anime-one-piece-we-are|We Are!|Hiroshi Kitadani|1999|https://www.youtube.com/watch?v=dM7x1PNZDo0|One Piece|Opening 1|East Blue",
  "anime-one-piece-believe|Believe|Folder5|2000|https://www.youtube.com/watch?v=qM_FepDsJ-Q|One Piece|Opening 2|Alabasta",
  "anime-one-piece-kokoro-no-chizu|Kokoro no Chizu|BOYSTYLE|2004|https://www.youtube.com/watch?v=RUZCdggY34c|One Piece|Opening 5|Water 7",
  "anime-one-piece-we-go|We Go!|Hiroshi Kitadani|2011|https://www.youtube.com/watch?v=HB4iNVa746E|One Piece|Opening 15|Return to Sabaody",
  "anime-one-piece-hope|Hope|Namie Amuro|2017|https://www.youtube.com/watch?v=Oo52vQyAR6w|One Piece|Opening 20|Whole Cake Island",
  "anime-one-piece-saikou-toutatsuten|Saikou Toutatsuten|SEKAI NO OWARI|2023|https://www.youtube.com/watch?v=SR89b0qqRAg|One Piece|Opening 26|Wano",
  "anime-tokyo-ghoul-unravel|unravel|TK from Ling Tosite Sigure|2014|https://www.youtube.com/watch?v=gQMmVCv8P3w|Tokyo Ghoul|Opening 1|Temporada 1",
  "anime-tokyo-ghoul-asphyxia|asphyxia|Co shu Nie|2018|https://www.youtube.com/watch?v=ksAJIsl047w|Tokyo Ghoul:re|Opening 1|Temporada 3",
  "anime-death-note-the-world|the WORLD|NIGHTMARE|2006|https://www.youtube.com/watch?v=D7MMMNTQ7H0|Death Note|Opening 1|Episodios 1-19",
  "anime-death-note-whats-up-people|What's up, people?!|Maximum the Hormone|2007|https://www.youtube.com/watch?v=_Nj0LQUcJKM|Death Note|Opening 2|Episodios 20-37",
  "anime-fairy-tail-snow-fairy|Snow fairy|FUNKIST|2009|https://www.youtube.com/watch?v=tdrGjixAtKU|Fairy Tail|Opening 1|Episodios 1-11",
  "anime-fairy-tail-ft|ft.|FUNKIST|2010|https://www.youtube.com/watch?v=R_5zSQjRIHs|Fairy Tail|Opening 3|Episodios 25-35",
  "anime-fairy-tail-masayume-chasing|Masayume Chasing|BoA|2014|https://www.youtube.com/watch?v=thOJqPmtiW4|Fairy Tail|Opening 15|Episodios 176-188",
  "anime-naruto-haruka-kanata|Haruka Kanata|Asian Kung-Fu Generation|2003|https://www.youtube.com/watch?v=nJ6A6GC_ki4|Naruto|Opening 2|Examen Chunin",
  "anime-naruto-go|GO!!!|FLOW|2004|https://www.youtube.com/watch?v=uBqvL0Oee-8|Naruto|Opening 4|Rescate de Sasuke",
  "anime-naruto-blue-bird|Blue Bird|Ikimono-gakari|2008|https://www.youtube.com/watch?v=KpsJWFuVTdI|Naruto: Shippuuden|Opening 3|Hidan / Kakuzu",
  "anime-naruto-sign|Sign|FLOW|2010|https://www.youtube.com/watch?v=97dkzVU4p-M|Naruto: Shippuuden|Opening 6|Pain",
  "anime-naruto-silhouette|Silhouette|KANA-BOON|2014|https://www.youtube.com/watch?v=dlFA0Zq1k2A|Naruto: Shippuuden|Opening 16|Cuarta guerra ninja",
  "anime-bleach-asterisk|Asterisk|Orange Range|2004|https://www.youtube.com/watch?v=GH0zZgI205s|Bleach|Opening 1|Substitute Shinigami",
  "anime-bleach-d-tecnolife|D-tecnoLife|UVERworld|2005|https://www.youtube.com/watch?v=h1MoLQ9Wcv0|Bleach|Opening 2|Soul Society",
  "anime-bleach-after-dark|After Dark|Asian Kung-Fu Generation|2007|https://www.youtube.com/watch?v=J_IsnEZcl4E|Bleach|Opening 7|Hueco Mundo",
  "anime-bleach-ranbu-no-melody|Ranbu no Melody|SID|2010|https://www.youtube.com/watch?v=MSG4p7rMyn4|Bleach|Opening 13|Arrancar",
  "anime-aot-guren-no-yumiya|Guren no Yumiya|Linked Horizon|2013|https://www.youtube.com/watch?v=2B6nj38AdD0|Attack on Titan|Opening 1|Temporada 1",
  "anime-aot-shinzou-wo-sasageyo|Shinzou wo Sasageyo!|Linked Horizon|2017|https://www.youtube.com/watch?v=CID-sYQNCew|Attack on Titan|Opening 3|Temporada 2",
  "anime-aot-red-swan|Red Swan|YOSHIKI feat. HYDE|2018|https://www.youtube.com/watch?v=r1XE8ON8fos|Attack on Titan|Opening 4|Temporada 3",
  "anime-aot-the-rumbling|The Rumbling|SiM|2022|https://www.youtube.com/watch?v=2S4qGKmzBJE|Attack on Titan|Opening 7|Final Season Part 2",
  "anime-demon-slayer-gurenge|Gurenge|LiSA|2019|https://www.youtube.com/watch?v=x1FV6IrjZCY|Demon Slayer: Kimetsu no Yaiba|Opening 1|Temporada 1",
  "anime-demon-slayer-homura|Homura|LiSA|2020|https://www.youtube.com/watch?v=jwriFosLRww|Demon Slayer: Mugen Train|Tema pelicula|Mugen Train",
  "anime-demon-slayer-zankyou-sanka|Zankyou Sanka|Aimer|2021|https://www.youtube.com/watch?v=isFdoIq0DGc|Demon Slayer: Entertainment District Arc|Opening 1|Yuukaku-hen",
  "anime-jujutsu-kaisen-kaikai-kitan|Kaikai Kitan|Eve|2020|https://www.youtube.com/watch?v=1tk1pqwrOys|Jujutsu Kaisen|Opening 1|Temporada 1",
  "anime-jujutsu-kaisen-ao-no-sumika|Ao no Sumika|Tatsuya Kitani|2023|https://www.youtube.com/watch?v=gcgKUcJKxIs|Jujutsu Kaisen|Opening 3|Hidden Inventory",
  "anime-jujutsu-kaisen-specialz|SPECIALZ|King Gnu|2023|https://www.youtube.com/watch?v=ldEzCnE89a4|Jujutsu Kaisen|Opening 4|Shibuya Incident",
  "anime-mha-peace-sign|Peace Sign|Kenshi Yonezu|2017|https://www.youtube.com/watch?v=9aJVr5tTTWk|My Hero Academia|Opening 2|Temporada 2",
  "anime-mha-odd-future|ODD FUTURE|UVERworld|2018|https://www.youtube.com/watch?v=gXAHzzL2Tv0|My Hero Academia|Opening 4|Temporada 3",
  "track-again|Again|YUI|2009|https://www.youtube.com/watch?v=FM3aJQzqV90|Fullmetal Alchemist: Brotherhood|Opening 1|Inicio de serie",
  "anime-fma-melissa|Melissa|Porno Graffitti|2003|https://www.youtube.com/watch?v=JbXmAAGXZlE|Fullmetal Alchemist|Opening 1|Serie original",
  "anime-fma-rewrite|Rewrite|Asian Kung-Fu Generation|2004|https://www.youtube.com/watch?v=ZmeudwRMrsU|Fullmetal Alchemist|Opening 4|Final",
  "anime-evangelion-cruel-angels-thesis|A Cruel Angel's Thesis|Yoko Takahashi|1995|https://www.youtube.com/watch?v=kZPy220iZpE|Neon Genesis Evangelion|Opening|Serie original",
  "anime-cowboy-bebop-tank|Tank!|The Seatbelts|1998|https://www.youtube.com/watch?v=M_25mVjKwcc|Cowboy Bebop|Opening|Serie original",
  "anime-sailor-moon-moonlight-densetsu|Moonlight Densetsu|Moon Lips|1994|https://www.youtube.com/watch?v=C-FlY06dNv8|Sailor Moon S|Opening|Temporada S",
  "anime-digimon-butter-fly|Butter-Fly|Koji Wada|1999|https://www.youtube.com/watch?v=Q04iqoRYMcQ|Digimon Adventure|Opening|Serie original",
  "anime-hxh-departure|departure!|Masatoshi Ono|2011|https://www.youtube.com/watch?v=faqmNf_fZlE|Hunter x Hunter|Opening 1|Serie 2011",
  "anime-black-clover-black-rover|Black Rover|Vickeblanka|2018|https://www.youtube.com/watch?v=Y27hMeRCYzA|Black Clover|Opening 3|Witches Forest",
  "anime-black-clover-black-catcher|Black Catcher|Vickeblanka|2020|https://www.youtube.com/watch?v=hP6VM6YAMIE|Black Clover|Opening 10|Elf Reincarnation",
  "anime-chainsaw-man-kick-back|KICK BACK|Kenshi Yonezu|2022|https://www.youtube.com/watch?v=M2cckDmNLMI|Chainsaw Man|Opening|Temporada 1",
  "anime-oshi-no-ko-idol|Idol|YOASOBI|2023|https://www.youtube.com/watch?v=ZRtdQ81jPUQ|Oshi no Ko|Opening 1|Temporada 1",
  "anime-spy-family-mixed-nuts|Mixed Nuts|Official HIGE DANdism|2022|https://www.youtube.com/watch?v=CbH2F0kXgTY|Spy x Family|Opening 1|Temporada 1",
] as const;

function parseAnimePackTrack(row: string): Track {
  const [id, title, artist, year, youtubeUrl, anime, animeSlot, animeSeason] =
    row.split("|");

  return {
    id,
    title,
    artist,
    year: Number(year),
    mode: "Anime",
    modes: defaultModesForTrack("Anime"),
    audioSrc: youtubeUrl,
    extra: {
      anime,
      animeSlot,
      animeSeason,
    },
  };
}

const ANIME_PACK = ANIME_PACK_ROWS.map(parseAnimePackTrack);

const AUTOMATIC_PACKS = [
  ...EUROVISION_PACKS,
  { id: GLOBAL_HITS_PACK_ID, tracks: GLOBAL_HITS_PACK },
  { id: GLOBAL_SPANISH_HITS_PACK_ID, tracks: GLOBAL_SPANISH_HITS_PACK },
  { id: GLOBAL_LATIN_HITS_PACK_ID, tracks: GLOBAL_LATIN_HITS_PACK },
  { id: GLOBAL_CURRENT_POP_PACK_ID, tracks: GLOBAL_CURRENT_POP_PACK },
  { id: GLOBAL_2025_2026_LATIN_PACK_ID, tracks: GLOBAL_2025_2026_LATIN_PACK },
  { id: GLOBAL_MASSIVE_POP_PACK_ID, tracks: GLOBAL_MASSIVE_POP_PACK },
  { id: GLOBAL_REQUESTED_CLASSICS_PACK_ID, tracks: GLOBAL_REQUESTED_CLASSICS_PACK },
  { id: GLOBAL_REQUESTED_POP_DANCE_PACK_ID, tracks: GLOBAL_REQUESTED_POP_DANCE_PACK },
  { id: GLOBAL_REQUESTED_HITS_PACK_ID, tracks: GLOBAL_REQUESTED_HITS_PACK },
  { id: GLOBAL_SPANISH_REQUESTED_HITS_PACK_ID, tracks: GLOBAL_SPANISH_REQUESTED_HITS_PACK },
  { id: GLOBAL_LATIN_CURRENT_REQUESTED_PACK_ID, tracks: GLOBAL_LATIN_CURRENT_REQUESTED_PACK },
  { id: GLOBAL_PARTY_LATIN_REQUESTED_PACK_ID, tracks: GLOBAL_PARTY_LATIN_REQUESTED_PACK },
  { id: GLOBAL_DIVAS_POP_REQUESTED_PACK_ID, tracks: GLOBAL_DIVAS_POP_REQUESTED_PACK },
  { id: GLOBAL_CODEX_SUGGESTIONS_PACK_ID, tracks: GLOBAL_CODEX_SUGGESTIONS_PACK },
  { id: OT_PACK_ID, tracks: OT_PACK },
  { id: OT_EXTRA_PACK_ID, tracks: OT_EXTRA_PACK },
  { id: OT_MORE_ICONIC_PACK_ID, tracks: OT_MORE_ICONIC_PACK },
  { id: OT_2025_EXTRA_PACK_ID, tracks: OT_2025_EXTRA_PACK },
  { id: ANIME_PACK_ID, tracks: ANIME_PACK },
] as const;

const AUTOMATIC_TRACKS_BY_ID = new Map(
  AUTOMATIC_PACKS.flatMap((pack) => pack.tracks.map((track) => [track.id, track])),
);

const AUTOMATIC_TRACK_PACK_ID_BY_TRACK_ID = new Map(
  AUTOMATIC_PACKS.flatMap((pack) =>
    pack.tracks.map((track) => [track.id, pack.id]),
  ),
);

const OT_PACK_TRACK_IDS = new Set(
  [
    ...OT_PACK,
    ...OT_EXTRA_PACK,
    ...OT_MORE_ICONIC_PACK,
    ...OT_2025_EXTRA_PACK,
  ].map((track) => track.id),
);
const ANIME_PACK_TRACK_IDS = new Set(ANIME_PACK.map((track) => track.id));
const DEFAULT_REPLACED_TRACK_IDS = new Set([
  ...OT_PACK_TRACK_IDS,
  ...ANIME_PACK_TRACK_IDS,
]);

function mergeAutomaticPacks(catalog: Track[], importedPacks: string[]) {
  const cleanedCatalog = catalog.filter(
    (track) => !PRUNED_EUROVISION_TRACK_IDS.has(track.id),
  );
  const updatedCatalog = cleanedCatalog.map((track) => {
    const automaticTrack = AUTOMATIC_TRACKS_BY_ID.get(track.id);
    const packId = AUTOMATIC_TRACK_PACK_ID_BY_TRACK_ID.get(track.id);

    if (automaticTrack && packId && !importedPacks.includes(packId)) {
      return automaticTrack;
    }

    return track;
  });
  const existingIds = new Set(updatedCatalog.map((track) => track.id));
  const nextImportedPacks = [...importedPacks];
  const missingTracks: Track[] = [];

  AUTOMATIC_PACKS.forEach((pack) => {
    pack.tracks.forEach((track) => {
      if (!existingIds.has(track.id)) {
        existingIds.add(track.id);
        missingTracks.push(track);
      }
    });

    if (!nextImportedPacks.includes(pack.id)) {
      nextImportedPacks.push(pack.id);
    }
  });

  return {
    catalog: [...updatedCatalog, ...missingTracks],
    importedPacks: nextImportedPacks,
  };
}

const DEFAULT_TRACKS: Track[] = [
  {
    id: "track-euphoria",
    title: "Euphoria",
    artist: "Loreen",
    year: 2012,
    mode: "Eurovisión",
    audioSrc: "",
    extra: {
      country: "Suecia",
      euroPosition: "Ganadora",
      language: "Inglés",
    },
  },
  {
    id: "track-zitti",
    title: "Zitti e buoni",
    artist: "Måneskin",
    year: 2021,
    mode: "Eurovisión",
    audioSrc: "",
    extra: {
      country: "Italia",
      euroPosition: "Ganadora",
      language: "Italiano",
    },
  },
  {
    id: "track-lo-malo",
    title: "Lo malo",
    artist: "Aitana y Ana Guerra",
    year: 2018,
    mode: "OT",
    audioSrc: "",
    extra: {
      otPerformers: "Aitana y Ana Guerra",
      otEdition: "OT 2017",
      otGala: "Gala Eurovisión",
      otNominations: "Ninguna de las dos",
    },
  },
  {
    id: "track-tu-cancion",
    title: "Tu canción",
    artist: "Amaia y Alfred",
    year: 2018,
    mode: "OT",
    audioSrc: "",
    extra: {
      otPerformers: "Amaia y Alfred",
      otEdition: "OT 2017",
      otGala: "Gala Eurovisión",
      otNominations: "Ninguno de los dos",
    },
  },
  {
    id: "track-in-the-end",
    title: "In the End",
    artist: "Linkin Park",
    year: 2000,
    mode: "2000s",
    audioSrc: "",
    extra: {},
  },
  {
    id: "track-toxic",
    title: "Toxic",
    artist: "Britney Spears",
    year: 2003,
    mode: "2000s",
    audioSrc: "",
    extra: {},
  },
  {
    id: "track-again",
    title: "Again",
    artist: "YUI",
    year: 2009,
    mode: "Anime",
    audioSrc: "",
    extra: {
      anime: "Fullmetal Alchemist: Brotherhood",
      animeSlot: "Opening 1",
      animeSeason: "Inicio de serie",
    },
  },
  {
    id: "track-cha-la",
    title: "CHA-LA HEAD-CHA-LA",
    artist: "Hironobu Kageyama",
    year: 1989,
    mode: "Anime",
    audioSrc: "",
    extra: {
      anime: "Dragon Ball Z",
      animeSlot: "Opening 1",
      animeSeason: "Saga Saiyan",
    },
  },
];

const DEFAULT_STATE: GameState = {
  mode: "OT",
  structure: "individual",
  selectedFields: ["song", "year", "title", "author", "otPerformers"],
  players: [
    { id: "player-1", name: "Jugador 1", teamId: null, score: 0, cards: [] },
    { id: "player-2", name: "Jugador 2", teamId: null, score: 0, cards: [] },
  ],
  teams: [
    { id: "team-1", name: "Equipo A", score: 0, cards: [] },
    { id: "team-2", name: "Equipo B", score: 0, cards: [] },
  ],
  catalog: [
    ...DEFAULT_TRACKS.filter((track) => !DEFAULT_REPLACED_TRACK_IDS.has(track.id)),
    ...EUROVISION_PACK_50,
    ...EUROVISION_CLASSICS_PACK,
    ...GLOBAL_HITS_PACK,
    ...GLOBAL_SPANISH_HITS_PACK,
    ...GLOBAL_LATIN_HITS_PACK,
    ...GLOBAL_CURRENT_POP_PACK,
    ...GLOBAL_2025_2026_LATIN_PACK,
    ...GLOBAL_MASSIVE_POP_PACK,
    ...GLOBAL_REQUESTED_CLASSICS_PACK,
    ...GLOBAL_REQUESTED_POP_DANCE_PACK,
    ...GLOBAL_REQUESTED_HITS_PACK,
    ...GLOBAL_SPANISH_REQUESTED_HITS_PACK,
    ...GLOBAL_LATIN_CURRENT_REQUESTED_PACK,
    ...GLOBAL_PARTY_LATIN_REQUESTED_PACK,
    ...GLOBAL_DIVAS_POP_REQUESTED_PACK,
    ...GLOBAL_CODEX_SUGGESTIONS_PACK,
    ...OT_PACK,
    ...OT_EXTRA_PACK,
    ...OT_MORE_ICONIC_PACK,
    ...OT_2025_EXTRA_PACK,
    ...ANIME_PACK,
  ],
  importedPacks: [
    EUROVISION_PACK_ID,
    EUROVISION_CLASSICS_PACK_ID,
    GLOBAL_HITS_PACK_ID,
    GLOBAL_SPANISH_HITS_PACK_ID,
    GLOBAL_LATIN_HITS_PACK_ID,
    GLOBAL_CURRENT_POP_PACK_ID,
    GLOBAL_2025_2026_LATIN_PACK_ID,
    GLOBAL_MASSIVE_POP_PACK_ID,
    GLOBAL_REQUESTED_CLASSICS_PACK_ID,
    GLOBAL_REQUESTED_POP_DANCE_PACK_ID,
    GLOBAL_REQUESTED_HITS_PACK_ID,
    GLOBAL_SPANISH_REQUESTED_HITS_PACK_ID,
    GLOBAL_LATIN_CURRENT_REQUESTED_PACK_ID,
    GLOBAL_PARTY_LATIN_REQUESTED_PACK_ID,
    GLOBAL_DIVAS_POP_REQUESTED_PACK_ID,
    GLOBAL_CODEX_SUGGESTIONS_PACK_ID,
    OT_PACK_ID,
    OT_EXTRA_PACK_ID,
    OT_MORE_ICONIC_PACK_ID,
    OT_2025_EXTRA_PACK_ID,
    ANIME_PACK_ID,
  ],
  currentTrackId: null,
  timelineYear: null,
  usedTrackIds: [],
  revealed: false,
  scoreFields: [],
  turnIndex: 0,
  round: 1,
  handView: "player:player-1",
  followTurnHand: true,
  avoidRepeats: true,
  includeOtGalaInGlobales: false,
};

const EMPTY_DRAFT: DraftTrack = {
  title: "",
  artist: "",
  year: "",
  mode: "OT",
  modes: defaultModesForTrack("OT"),
  audioSrc: "",
  extra: {},
};

function makeId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function pickTimelineYear(pool: Track[], selectedFields: GuessFieldId[]) {
  if (!selectedFields.includes("range")) {
    return null;
  }

  const yearPool = pool
    .map((track) => track.year)
    .filter((year) => Number.isFinite(year));

  if (!yearPool.length) {
    return null;
  }

  return yearPool[Math.floor(Math.random() * yearPool.length)];
}

function makeTimelineYearCard(year: number): Card {
  return {
    id: makeId("timeline-card"),
    trackId: `timeline-year-${year}`,
    title: "Año de referencia",
    artist: "Timeline",
    year,
    mode: "Globales",
    modes: ["Globales"],
    points: 0,
    round: 0,
    kind: "timeline-year",
  };
}

function normalizeCard(card: Partial<Card>): Card | null {
  if (!Number.isFinite(card.year)) {
    return null;
  }

  return {
    id: card.id || makeId("card"),
    trackId: card.trackId || `timeline-year-${card.year}`,
    title: card.title || "Año de referencia",
    artist: card.artist || (card.kind === "timeline-year" ? "Timeline" : ""),
    year: Number(card.year),
    mode: isTrackMode(card.mode) ? card.mode : "Globales",
    modes: card.modes?.filter(isTrackMode),
    points: Number(card.points) || 0,
    round: Number(card.round) || 0,
    kind: card.kind === "timeline-year" ? "timeline-year" : "won",
  };
}

function removeTimelineYearCards(cards: Card[]) {
  return cards.filter((card) => card.kind !== "timeline-year");
}

function ensureTimelineYearCard(cards: Card[], eligible: Track[], resetTimelineYear = false) {
  const currentCards = resetTimelineYear ? removeTimelineYearCards(cards) : cards;

  if (currentCards.some((card) => card.kind === "timeline-year")) {
    return currentCards;
  }

  const year = pickTimelineYear(eligible, ["range"]);
  return year === null ? currentCards : [makeTimelineYearCard(year), ...currentCards];
}

function syncTimelineYearCards(
  state: GameState,
  selectedFields = state.selectedFields,
  resetTimelineYears = false,
) {
  if (!selectedFields.includes("range")) {
    return {
      ...state,
      timelineYear: null,
      players: state.players.map((player) => ({
        ...player,
        cards: removeTimelineYearCards(player.cards),
      })),
      teams: state.teams.map((team) => ({
        ...team,
        cards: removeTimelineYearCards(team.cards),
      })),
    };
  }

  const eligible = state.catalog.filter((track) =>
    trackMatchesMode(track, state.mode, {
      includeOtGalaInGlobales: state.includeOtGalaInGlobales,
    }),
  );

  return {
    ...state,
    timelineYear: null,
    players: state.players.map((player) => ({
      ...player,
      cards: ensureTimelineYearCard(player.cards, eligible, resetTimelineYears),
    })),
    teams: state.teams.map((team) => ({
      ...team,
      cards: ensureTimelineYearCard(team.cards, eligible, resetTimelineYears),
    })),
  };
}

function fieldLabel(fieldId: GuessFieldId) {
  return FIELD_DEFS.find((field) => field.id === fieldId)?.label ?? fieldId;
}

function availableFieldsForMode(mode: GameMode) {
  if (mode === "Todo") {
    return FIELD_DEFS.map((field) => field.id);
  }

  return [...BASE_FIELD_IDS, ...EXTRA_FIELDS_BY_MODE[mode]];
}

function getParticipants(state: GameState): Participant[] {
  if (state.structure === "teams") {
    return state.teams.map((team) => {
      const members = state.players
        .filter((player) => player.teamId === team.id)
        .map((player) => player.name)
        .join(", ");

      return {
        key: `team:${team.id}`,
        kind: "teams",
        id: team.id,
        name: team.name,
        score: team.score,
        cards: team.cards,
        members: members || "Sin jugadores",
      };
    });
  }

  return state.players.map((player) => ({
    key: `player:${player.id}`,
    kind: "individual",
    id: player.id,
    name: player.name,
    score: player.score,
    cards: player.cards,
  }));
}

function normalizeTrack(raw: Partial<Track>, index: number): Track {
  const fallbackMode: TrackMode = isTrackMode(raw.mode) ? raw.mode : "OT";
  const extra =
    raw.extra && typeof raw.extra === "object" && !Array.isArray(raw.extra)
      ? raw.extra
      : {};
  const rawYear =
    typeof raw.year === "number" && Number.isFinite(raw.year)
      ? raw.year
      : new Date().getFullYear();
  const modes = normalizedTrackModes(fallbackMode, raw.modes, extra);

  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeId("track"),
    title:
      typeof raw.title === "string" && raw.title.trim()
        ? raw.title.trim()
        : `Pista ${index + 1}`,
    artist:
      typeof raw.artist === "string" && raw.artist.trim()
        ? raw.artist.trim()
        : "Artista pendiente",
    year: resolveTrackYear(fallbackMode, rawYear, extra),
    mode: fallbackMode,
    modes,
    audioSrc:
      typeof raw.audioSrc === "string" ? raw.audioSrc.trim() : "",
    extra,
  };
}

function normalizeState(raw: Partial<GameState>): GameState {
  const mode = MODES.includes(raw.mode as GameMode)
    ? (raw.mode as GameMode)
    : DEFAULT_STATE.mode;
  const available = availableFieldsForMode(mode);
  const selectedFields =
    Array.isArray(raw.selectedFields) && raw.selectedFields.length
      ? raw.selectedFields.filter((field): field is GuessFieldId =>
          available.includes(field as GuessFieldId),
        )
      : DEFAULT_STATE.selectedFields;
  const importedPacks = Array.isArray(raw.importedPacks)
    ? raw.importedPacks
    : [];
  const catalog =
    Array.isArray(raw.catalog) && raw.catalog.length
      ? raw.catalog.map(normalizeTrack)
      : DEFAULT_STATE.catalog;
  const mergedCatalog = mergeAutomaticPacks(catalog, importedPacks);

  return syncTimelineYearCards({
    ...DEFAULT_STATE,
    ...raw,
    mode,
    structure: raw.structure === "teams" ? "teams" : "individual",
    selectedFields: selectedFields.length ? selectedFields : [available[0]],
    players:
      Array.isArray(raw.players) && raw.players.length
        ? raw.players.map((player, index) => ({
            id: player.id || makeId("player"),
            name: player.name || `Jugador ${index + 1}`,
            teamId: player.teamId ?? null,
            score: Number(player.score) || 0,
            cards: Array.isArray(player.cards)
              ? player.cards.map(normalizeCard).filter((card): card is Card => Boolean(card))
              : [],
          }))
        : DEFAULT_STATE.players,
    teams:
      Array.isArray(raw.teams) && raw.teams.length
        ? raw.teams.map((team, index) => ({
            id: team.id || makeId("team"),
            name: team.name || `Equipo ${index + 1}`,
            score: Number(team.score) || 0,
            cards: Array.isArray(team.cards)
              ? team.cards.map(normalizeCard).filter((card): card is Card => Boolean(card))
              : [],
          }))
        : DEFAULT_STATE.teams,
    catalog: mergedCatalog.catalog,
    importedPacks: mergedCatalog.importedPacks,
    currentTrackId: raw.currentTrackId ?? null,
    timelineYear:
      raw.currentTrackId &&
      typeof raw.timelineYear === "number" &&
      Number.isFinite(raw.timelineYear)
        ? raw.timelineYear
        : null,
    usedTrackIds: Array.isArray(raw.usedTrackIds) ? raw.usedTrackIds : [],
    revealed: Boolean(raw.revealed),
    scoreFields: Array.isArray(raw.scoreFields) ? raw.scoreFields : [],
    turnIndex: Number(raw.turnIndex) || 0,
    round: Number(raw.round) || 1,
    handView: raw.handView ?? null,
    followTurnHand: raw.followTurnHand ?? true,
    avoidRepeats: raw.avoidRepeats ?? true,
    includeOtGalaInGlobales: raw.includeOtGalaInGlobales === true,
  });
}

function applyScoreAndNextState(
  current: GameState,
  expectedActiveKey?: string,
  expectedTrackId?: string,
) {
  const currentParticipants = getParticipants(current);
  const active = currentParticipants.length
    ? currentParticipants[current.turnIndex % currentParticipants.length]
    : null;
  const track = current.catalog.find(
    (catalogTrack) => catalogTrack.id === current.currentTrackId,
  );

  if (
    !active ||
    !track ||
    (expectedActiveKey && active.key !== expectedActiveKey) ||
    (expectedTrackId && track.id !== expectedTrackId)
  ) {
    return current;
  }

  const nextParticipant =
    currentParticipants[(current.turnIndex + 1) % currentParticipants.length] ??
    active;
  const points = current.scoreFields.length;
  const card: Card | null =
    points > 0
      ? {
          id: makeId("card"),
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          year: track.year,
          mode: track.mode,
          modes: normalizedTrackModes(track.mode, track.modes, track.extra),
          points,
          round: current.round,
          kind: "won",
        }
      : null;

  return {
    ...current,
    players:
      active.kind === "individual"
        ? current.players.map((player) =>
            player.id === active.id
              ? {
                  ...player,
                  score: player.score + points,
                  cards: card ? [...player.cards, card] : player.cards,
                }
              : player,
          )
        : current.players,
    teams:
      active.kind === "teams"
        ? current.teams.map((team) =>
            team.id === active.id
              ? {
                  ...team,
                  score: team.score + points,
                  cards: card ? [...team.cards, card] : team.cards,
                }
              : team,
          )
        : current.teams,
    currentTrackId: null,
    timelineYear: null,
    usedTrackIds: current.currentTrackId
      ? Array.from(new Set([...current.usedTrackIds, current.currentTrackId]))
      : current.usedTrackIds,
    revealed: false,
    scoreFields: [],
    turnIndex: current.turnIndex + 1,
    round: current.round + 1,
    handView: nextParticipant.key,
    followTurnHand: true,
  };
}

function valueForField(track: Track, fieldId: GuessFieldId) {
  switch (fieldId) {
    case "song":
      return `${track.title} - ${track.artist}`;
    case "year":
      return String(track.year);
    case "range":
      return `Colocar por año: ${track.year}`;
    case "title":
      return track.title;
    case "author":
      return track.artist;
    default:
      return track.extra[fieldId] || "No aplica";
  }
}

function getYouTubeVideoId(source: string) {
  const trimmed = source.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const url = new URL(trimmed, "https://local.twinkster");
    const host = url.hostname.replace(/^www\./, "").toLowerCase();

    if (host === "youtu.be") {
      return url.pathname.split("/").filter(Boolean)[0] ?? null;
    }

    if (host.endsWith("youtube.com") || host.endsWith("youtube-nocookie.com")) {
      const fromQuery = url.searchParams.get("v");
      if (fromQuery) {
        return fromQuery;
      }

      const parts = url.pathname.split("/").filter(Boolean);
      const videoPathIndex = parts.findIndex((part) =>
        ["embed", "shorts", "live"].includes(part),
      );
      return videoPathIndex >= 0 ? parts[videoPathIndex + 1] ?? null : null;
    }
  } catch {
    // Keep the regex fallback for pasted links with unusual formatting.
  }

  return (
    trimmed.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([\w-]{11})/,
    )?.[1] ?? null
  );
}

function getSourceKind(source: string) {
  if (!source.trim()) {
    return "none";
  }

  if (getYouTubeVideoId(source)) {
    return "youtube";
  }

  if (/spotify\.com|open\.spotify\.com/i.test(source)) {
    return "spotify";
  }

  return "audio";
}

function sourceTagLabel(source: string) {
  const kind = getSourceKind(source);
  if (kind === "youtube") {
    return "YouTube";
  }
  if (kind === "spotify") {
    return "Spotify";
  }
  if (kind === "audio") {
    return "MP3";
  }
  return "Sin audio";
}

function sourceTagText(source: string) {
  const kind = getSourceKind(source);
  if (kind === "youtube") {
    return "YT";
  }
  if (kind === "spotify") {
    return "SP";
  }
  if (kind === "audio") {
    return "MP3";
  }
  return "--";
}

function buildYouTubeEmbedUrl(videoId: string, origin: string) {
  const params = new URLSearchParams({
    enablejsapi: "1",
    playsinline: "1",
    rel: "0",
    modestbranding: "1",
  });

  if (origin) {
    params.set("origin", origin);
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

export default function TwinksterGame() {
  const [state, setState] = useState<GameState>(DEFAULT_STATE);
  const [theme, setTheme] = useState<Theme>("dark");
  const [hydrated, setHydrated] = useState(false);
  const [draft, setDraft] = useState<DraftTrack>(EMPTY_DRAFT);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [bulkText, setBulkText] = useState("");
  const [catalogStatus, setCatalogStatus] = useState("");
  const [catalogFilterMode, setCatalogFilterMode] = useState<GameMode>("Todo");
  const [catalogSort, setCatalogSort] =
    useState<CatalogSortOption>("year-desc");
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogPanelOpen, setCatalogPanelOpen] = useState(false);
  const [setupPanelCollapsed, setSetupPanelCollapsed] = useState(false);
  const [audioStatus, setAudioStatus] = useState("");
  const [youtubePlaying, setYoutubePlaying] = useState(false);
  const [youtubeDockOpen, setYoutubeDockOpen] = useState(false);
  const [scoreAnimation, setScoreAnimation] = useState<ScoreAnimation | null>(
    null,
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const youtubeFrameRef = useRef<HTMLIFrameElement | null>(null);
  const youtubeAutoPlayRef = useRef(false);
  const youtubeTimeRef = useRef(0);
  const youtubeStartedAtRef = useRef<number | null>(null);
  const scoreAnimationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setState(normalizeState(JSON.parse(saved) as Partial<GameState>));
      }

      const savedTheme = localStorage.getItem(THEME_KEY);
      setTheme(savedTheme === "light" ? "light" : "dark");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (hydrated) {
      localStorage.setItem(THEME_KEY, theme);
    }
  }, [hydrated, theme]);

  useEffect(() => {
    if (hydrated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [hydrated, state]);

  useEffect(() => {
    return () => {
      if (scoreAnimationTimerRef.current) {
        clearTimeout(scoreAnimationTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setState((current) => {
      const merged = mergeAutomaticPacks(
        current.catalog,
        current.importedPacks,
      );

      if (
        merged.catalog.length === current.catalog.length &&
        merged.importedPacks.length === current.importedPacks.length
      ) {
        return current;
      }

      setCatalogStatus("Packs automáticos añadidos al catálogo.");
      return {
        ...current,
        catalog: merged.catalog,
        importedPacks: merged.importedPacks,
      };
    });
  }, [hydrated]);

  const participants = useMemo(() => getParticipants(state), [state]);
  const activeParticipant = participants.length
    ? participants[state.turnIndex % participants.length]
    : null;
  const activeKey = activeParticipant?.key ?? null;
  const currentTrack = state.catalog.find(
    (track) => track.id === state.currentTrackId,
  );
  const currentSourceKind = getSourceKind(currentTrack?.audioSrc ?? "");
  const currentYoutubeId = currentTrack?.audioSrc
    ? getYouTubeVideoId(currentTrack.audioSrc)
    : null;
  const currentYoutubeEmbedUrl = currentYoutubeId
    ? buildYouTubeEmbedUrl(
        currentYoutubeId,
        hydrated && typeof window !== "undefined" ? window.location.origin : "",
      )
    : "";
  const availableFields = availableFieldsForMode(state.mode);
  const maxPoints = state.selectedFields.length;
  const currentPoints = state.scoreFields.length;
  const isScoreAnimating = Boolean(scoreAnimation);
  const eligibleCatalog = state.catalog.filter((track) =>
    trackMatchesMode(track, state.mode, {
      includeOtGalaInGlobales: state.includeOtGalaInGlobales,
    }),
  );
  const catalogFilterCounts = useMemo(() => {
    const counts = new Map<GameMode, number>([["Todo", state.catalog.length]]);

    TRACK_MODES.forEach((mode) => {
      counts.set(
        mode,
        state.catalog.filter((track) => trackMatchesMode(track, mode)).length,
      );
    });

    return counts;
  }, [state.catalog]);
  const visibleCatalog = useMemo(() => {
    const searchTerm = normalizeModeLabel(catalogSearch);
    const filteredCatalog = state.catalog.filter((track) => {
      const matchesMode =
        catalogFilterMode === "Todo" ||
        trackMatchesMode(track, catalogFilterMode);

      if (!matchesMode) {
        return false;
      }

      return !searchTerm || catalogSearchText(track).includes(searchTerm);
    });

    return [...filteredCatalog].sort((first, second) =>
      compareCatalogTracks(first, second, catalogSort),
    );
  }, [catalogFilterMode, catalogSearch, catalogSort, state.catalog]);
  const hasCatalogFilters =
    catalogFilterMode !== "Todo" ||
    catalogSearch.trim().length > 0 ||
    catalogSort !== "year-desc";
  const handParticipant =
    participants.find((participant) => participant.key === state.handView) ??
    activeParticipant ??
    null;
  const editingTrack = editingTrackId
    ? state.catalog.find((track) => track.id === editingTrackId) ?? null
    : null;

  useEffect(() => {
    if (state.followTurnHand && activeKey && state.handView !== activeKey) {
      setState((current) => ({ ...current, handView: activeKey }));
    }
  }, [activeKey, state.followTurnHand, state.handView]);

  useEffect(() => {
    if (!editingTrackId) {
      return;
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        cancelEditingTrack();
      }
    }

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [editingTrackId]);

  useEffect(() => {
    setAudioStatus("");
    setYoutubePlaying(false);
    setYoutubeDockOpen(false);
    youtubeAutoPlayRef.current = false;
    youtubeTimeRef.current = 0;
    youtubeStartedAtRef.current = null;
    audioRef.current?.load();
  }, [state.currentTrackId]);

  function updateMode(mode: GameMode) {
    const nextAvailable = availableFieldsForMode(mode);
    setState((current) => {
      const selected = current.selectedFields.filter((field) =>
        nextAvailable.includes(field),
      );

      const selectedFields = selected.length ? selected : BASE_FIELD_IDS;

      return syncTimelineYearCards({
        ...current,
        mode,
        selectedFields,
        currentTrackId: null,
        timelineYear: null,
        revealed: false,
        scoreFields: [],
      }, selectedFields, true);
    });
  }

  function updateDraftPrimaryMode(mode: TrackMode) {
    setDraft((current) => ({
      ...current,
      mode,
      modes: defaultModesForTrack(mode),
      extra: mode === current.mode ? current.extra : {},
    }));
  }

  function toggleDraftMode(mode: TrackMode) {
    setDraft((current) => {
      const currentModes = modesForTrack(current.mode, current.modes);
      const nextModes = currentModes.includes(mode)
        ? currentModes.filter((currentMode) => currentMode !== mode)
        : [...currentModes, mode];
      const modes = uniqueTrackModes(nextModes, current.mode);

      return {
        ...current,
        mode: modes.includes(current.mode) ? current.mode : (modes[0] ?? current.mode),
        modes,
      };
    });
  }

  function toggleField(fieldId: GuessFieldId) {
    setState((current) => {
      const exists = current.selectedFields.includes(fieldId);
      if (exists && current.selectedFields.length === 1) {
        return current;
      }

      const selectedFields = exists
        ? current.selectedFields.filter((field) => field !== fieldId)
        : [...current.selectedFields, fieldId];

      return syncTimelineYearCards({
        ...current,
        selectedFields,
        timelineYear: null,
        scoreFields: current.scoreFields.filter((field) => field !== fieldId),
      }, selectedFields, fieldId === "range");
    });
  }

  function toggleOtGalaInGlobales(checked: boolean) {
    setState((current) => {
      const resetsCurrentGlobalTrack = current.mode === "Globales";

      return syncTimelineYearCards({
        ...current,
        includeOtGalaInGlobales: checked,
        currentTrackId: resetsCurrentGlobalTrack ? null : current.currentTrackId,
        timelineYear: null,
        revealed: resetsCurrentGlobalTrack ? false : current.revealed,
        scoreFields: resetsCurrentGlobalTrack ? [] : current.scoreFields,
      }, current.selectedFields, true);
    });
  }

  function setPlayerCount(count: number) {
    const safeCount = Math.max(1, Math.min(16, count));
    setState((current) => {
      const players = [...current.players];
      while (players.length < safeCount) {
        players.push({
          id: makeId("player"),
          name: `Jugador ${players.length + 1}`,
          teamId: null,
          score: 0,
          cards: [],
        });
      }

      return syncTimelineYearCards({
        ...current,
        players: players.slice(0, safeCount),
        turnIndex: 0,
      });
    });
  }

  function updatePlayer(playerId: string, patch: Partial<Player>) {
    setState((current) => ({
      ...current,
      players: current.players.map((player) =>
        player.id === playerId ? { ...player, ...patch } : player,
      ),
    }));
  }

  function addTeam() {
    setState((current) =>
      syncTimelineYearCards({
        ...current,
        teams: [
          ...current.teams,
          {
            id: makeId("team"),
            name: `Equipo ${current.teams.length + 1}`,
            score: 0,
            cards: [],
          },
        ],
      }),
    );
  }

  function updateTeam(teamId: string, patch: Partial<Team>) {
    setState((current) => ({
      ...current,
      teams: current.teams.map((team) =>
        team.id === teamId ? { ...team, ...patch } : team,
      ),
    }));
  }

  function removeTeam(teamId: string) {
    setState((current) => ({
      ...current,
      teams: current.teams.filter((team) => team.id !== teamId),
      players: current.players.map((player) =>
        player.teamId === teamId ? { ...player, teamId: null } : player,
      ),
      turnIndex: 0,
    }));
  }

  function newGame() {
    setState((current) =>
      syncTimelineYearCards({
        ...current,
        players: current.players.map((player) => ({
          ...player,
          score: 0,
          cards: [],
        })),
        teams: current.teams.map((team) => ({ ...team, score: 0, cards: [] })),
        currentTrackId: null,
        timelineYear: null,
        usedTrackIds: [],
        revealed: false,
        scoreFields: [],
        turnIndex: 0,
        round: 1,
        handView: current.structure === "teams"
          ? `team:${current.teams[0]?.id ?? ""}`
          : `player:${current.players[0]?.id ?? ""}`,
        followTurnHand: true,
      }, current.selectedFields, true),
    );
  }

  function pickTrack() {
    setState((current) => {
      const eligible = current.catalog.filter((track) =>
        trackMatchesMode(track, current.mode, {
          includeOtGalaInGlobales: current.includeOtGalaInGlobales,
        }),
      );
      const unused = eligible.filter(
        (track) => !current.usedTrackIds.includes(track.id),
      );
      const pool = current.avoidRepeats && unused.length ? unused : eligible;

      if (!pool.length) {
        setCatalogStatus("No hay canciones para este modo.");
        return current;
      }

      const track = pool[Math.floor(Math.random() * pool.length)];
      setCatalogStatus("");

      return {
        ...current,
        currentTrackId: track.id,
        timelineYear: null,
        revealed: false,
        scoreFields: [],
      };
    });
  }

  function getYouTubeElapsedSeconds() {
    if (youtubeStartedAtRef.current === null) {
      return youtubeTimeRef.current;
    }

    return youtubeTimeRef.current + (performance.now() - youtubeStartedAtRef.current) / 1000;
  }

  function setYouTubePlaybackState(playing: boolean) {
    youtubeTimeRef.current = getYouTubeElapsedSeconds();
    youtubeStartedAtRef.current = playing ? performance.now() : null;
    setYoutubePlaying(playing);
  }

  function sendYouTubeCommand(func: string, args: unknown[] = []) {
    youtubeFrameRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func, args }),
      "https://www.youtube.com",
    );
  }

  function handleYouTubeReady() {
    setAudioStatus("YouTube listo");

    if (youtubeAutoPlayRef.current) {
      window.setTimeout(() => {
        sendYouTubeCommand("playVideo");
        setYouTubePlaybackState(true);
        setAudioStatus("Reproduciendo YouTube");
        youtubeAutoPlayRef.current = false;
      }, 180);
    }
  }

  function collapseYouTubeDock() {
    if (youtubePlaying) {
      sendYouTubeCommand("pauseVideo");
      setYouTubePlaybackState(false);
      setAudioStatus("YouTube pausado");
    }

    youtubeAutoPlayRef.current = false;
    setYoutubeDockOpen(false);
  }

  async function playAudio() {
    if (currentYoutubeId) {
      if (!youtubeDockOpen) {
        youtubeAutoPlayRef.current = true;
        setYoutubeDockOpen(true);
        setAudioStatus("Abriendo YouTube");
        return;
      }

      sendYouTubeCommand("playVideo");
      setYouTubePlaybackState(true);
      setAudioStatus("Reproduciendo YouTube");
      return;
    }

    if (currentSourceKind === "spotify") {
      setAudioStatus("Spotify no se controla desde Twinkster; abre el enlace externo.");
      return;
    }

    const audio = audioRef.current;
    if (!audio || !currentTrack?.audioSrc) {
      setAudioStatus("Esta pista no tiene audio configurado.");
      return;
    }

    try {
      await audio.play();
      setAudioStatus("Reproduciendo");
    } catch {
      setAudioStatus("No se pudo reproducir el audio.");
    }
  }

  function pauseAudio() {
    if (currentYoutubeId) {
      if (!youtubeDockOpen) {
        setYoutubeDockOpen(true);
        setAudioStatus("YouTube listo para pausar/reanudar");
        return;
      }

      if (youtubePlaying) {
        sendYouTubeCommand("pauseVideo");
        setYouTubePlaybackState(false);
        setAudioStatus("YouTube pausado");
      } else {
        sendYouTubeCommand("playVideo");
        setYouTubePlaybackState(true);
        setAudioStatus("Reproduciendo YouTube");
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (audio.paused) {
      void playAudio();
    } else {
      audio.pause();
      setAudioStatus("Pausado");
    }
  }

  function restartAudio() {
    if (currentYoutubeId) {
      if (!youtubeDockOpen) {
        youtubeAutoPlayRef.current = true;
        setYoutubeDockOpen(true);
        setAudioStatus("Abriendo YouTube");
        return;
      }

      youtubeTimeRef.current = 0;
      youtubeStartedAtRef.current = performance.now();
      sendYouTubeCommand("seekTo", [0, true]);
      sendYouTubeCommand("playVideo");
      setYoutubePlaying(true);
      setAudioStatus("YouTube reiniciado");
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = 0;
    void playAudio();
  }

  function forwardAudio() {
    if (currentYoutubeId) {
      if (!youtubeDockOpen) {
        setYoutubeDockOpen(true);
        setAudioStatus("YouTube listo para avanzar");
        return;
      }

      const nextTime = getYouTubeElapsedSeconds() + 15;
      youtubeTimeRef.current = nextTime;
      youtubeStartedAtRef.current = youtubePlaying ? performance.now() : null;
      sendYouTubeCommand("seekTo", [nextTime, true]);
      setAudioStatus("+15s en YouTube");
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = Math.min(audio.duration || Infinity, audio.currentTime + 15);
  }

  function toggleScoreField(fieldId: GuessFieldId) {
    setState((current) => {
      const exists = current.scoreFields.includes(fieldId);
      return {
        ...current,
        scoreFields: exists
          ? current.scoreFields.filter((field) => field !== fieldId)
          : [...current.scoreFields, fieldId],
      };
    });
  }

  function scoreAndNext() {
    if (!currentTrack || !activeParticipant || scoreAnimation) {
      return;
    }

    const nextParticipant =
      participants[(state.turnIndex + 1) % participants.length] ??
      activeParticipant;
    const animation: ScoreAnimation = {
      id: makeId("score"),
      activeKey: activeParticipant.key,
      trackId: currentTrack.id,
      participantName: activeParticipant.name,
      nextName: nextParticipant.name,
      points: currentPoints,
    };

    setScoreAnimation(animation);

    if (scoreAnimationTimerRef.current) {
      clearTimeout(scoreAnimationTimerRef.current);
    }

    scoreAnimationTimerRef.current = setTimeout(() => {
      setState((current) =>
        applyScoreAndNextState(current, animation.activeKey, animation.trackId),
      );
      setScoreAnimation(null);
      scoreAnimationTimerRef.current = null;
    }, SCORE_ANIMATION_MS);
  }

  function addDraftTrack(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const year = Number(draft.year);

    if (!draft.title.trim() || !draft.artist.trim() || !Number.isFinite(year)) {
      setCatalogStatus("Completa título, artista y año.");
      return;
    }

    const extra = Object.fromEntries(
      Object.entries(draft.extra).filter(([, value]) => value?.trim()),
    ) as Partial<Record<GuessFieldId, string>>;
    const modes = normalizedTrackModes(draft.mode, draft.modes, extra);

    const track: Track = {
      id: makeId("track"),
      title: draft.title.trim(),
      artist: draft.artist.trim(),
      year: resolveTrackYear(draft.mode, year, extra),
      mode: draft.mode,
      modes,
      audioSrc: draft.audioSrc.trim(),
      extra,
    };

    if (editingTrackId) {
      setState((current) => ({
        ...current,
        catalog: current.catalog.map((currentTrack) =>
          currentTrack.id === editingTrackId
            ? { ...track, id: editingTrackId }
            : currentTrack,
        ),
      }));
      setEditingTrackId(null);
      setDraft(EMPTY_DRAFT);
      setCatalogStatus("Canción actualizada.");
      return;
    }

    setState((current) => ({
      ...current,
      catalog: [...current.catalog, track],
    }));
    setDraft(EMPTY_DRAFT);
    setCatalogStatus("Canción añadida al catálogo.");
  }

  function startEditingTrack(track: Track) {
    setEditingTrackId(track.id);
    setDraft({
      title: track.title,
      artist: track.artist,
      year: String(track.year),
      mode: track.mode,
      modes: normalizedTrackModes(track.mode, track.modes, track.extra),
      audioSrc: track.audioSrc,
      extra: { ...track.extra },
    });
    setCatalogStatus("");
  }

  function cancelEditingTrack() {
    setEditingTrackId(null);
    setDraft(EMPTY_DRAFT);
    setCatalogStatus("");
  }

  function removeTrack(trackId: string, trackTitle: string) {
    const confirmed = window.confirm(
      `¿Eliminar "${trackTitle}" del catálogo? Esta acción no se puede deshacer.`,
    );

    if (!confirmed) {
      return;
    }

    if (editingTrackId === trackId) {
      cancelEditingTrack();
    }

    setState((current) => ({
      ...current,
      catalog: current.catalog.filter((track) => track.id !== trackId),
      currentTrackId:
        current.currentTrackId === trackId ? null : current.currentTrackId,
      timelineYear: current.currentTrackId === trackId ? null : current.timelineYear,
      usedTrackIds: current.usedTrackIds.filter((id) => id !== trackId),
    }));
  }

  async function importCatalog(file: File | undefined) {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Partial<Track>[];
      if (!Array.isArray(parsed)) {
        throw new Error("Invalid catalog");
      }

      setState((current) => ({
        ...current,
        catalog: parsed.map(normalizeTrack),
        currentTrackId: null,
        timelineYear: null,
        usedTrackIds: [],
        revealed: false,
        scoreFields: [],
      }));
      setCatalogStatus(`${parsed.length} canciones importadas.`);
    } catch {
      setCatalogStatus("El JSON no tiene formato de catálogo válido.");
    }
  }

  function parseMode(value: string | undefined): TrackMode {
    return modeFromText(value) ?? draft.mode;
  }

  function parseModes(value: string | undefined): TrackMode[] {
    const modes =
      value
        ?.split(/[,+;/]/)
        .map((part) => modeFromText(part))
        .filter((mode): mode is TrackMode => Boolean(mode)) ?? [];

    return uniqueTrackModes(modes.length ? modes : draft.modes, draft.mode);
  }

  function buildBulkTrack(line: string, index: number): Track | null {
    const parts = line
      .split("|")
      .map((part) => part.trim())
      .filter(Boolean);
    const sourceIndex = parts.findIndex((part) => getSourceKind(part) !== "none");

    if (sourceIndex < 0) {
      const source = line.trim();
      if (getSourceKind(source) === "none") {
        return null;
      }

      return {
        id: makeId("track"),
        title: `Pendiente ${index + 1}`,
        artist: "YouTube",
        year: new Date().getFullYear(),
        mode: draft.mode,
        modes: normalizedTrackModes(draft.mode, draft.modes, {}),
        audioSrc: source,
        extra: {},
      };
    }

    const source = parts[sourceIndex];
    const metadata = parts.filter((_, partIndex) => partIndex !== sourceIndex);
    const sourceFirst = sourceIndex === 0;
    const title = sourceFirst ? metadata[0] : metadata[0];
    const artist = sourceFirst ? metadata[1] : metadata[1];
    const year = Number(sourceFirst ? metadata[2] : metadata[2]);
    const parsedModes = parseModes(sourceFirst ? metadata[3] : metadata[3]);
    const mode = parsedModes[0] ?? parseMode(sourceFirst ? metadata[3] : metadata[3]);
    const modes = normalizedTrackModes(mode, parsedModes, {});

    return {
      id: makeId("track"),
      title: title || `Pendiente ${index + 1}`,
      artist: artist || "YouTube",
      year: Number.isFinite(year) ? year : new Date().getFullYear(),
      mode,
      modes,
      audioSrc: source,
      extra: {},
    };
  }

  function importBulkTracks() {
    const lines = bulkText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const tracks = lines
      .map((line, index) => buildBulkTrack(line, index))
      .filter((track): track is Track => Boolean(track));

    if (!tracks.length) {
      setCatalogStatus("No se ha encontrado ninguna fuente valida.");
      return;
    }

    setState((current) => ({
      ...current,
      catalog: [...current.catalog, ...tracks],
    }));
    setBulkText("");
    setCatalogStatus(`${tracks.length} canciones importadas en masa.`);
  }

  function exportCatalog() {
    const blob = new Blob([JSON.stringify(state.catalog, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "twinkster-catalogo.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetAll() {
    if (!window.confirm("¿Borrar partida, jugadores, equipos y catálogo local?")) {
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setState(DEFAULT_STATE);
    setDraft(EMPTY_DRAFT);
    setCatalogStatus("");
    setAudioStatus("");
  }

  const groupedFields = FIELD_DEFS.filter((field) =>
    availableFields.includes(field.id),
  ).reduce<Record<string, typeof FIELD_DEFS>>((groups, field) => {
    groups[field.group] = [...(groups[field.group] ?? []), field];
    return groups;
  }, {});

  const sortedCards = [...(handParticipant?.cards ?? [])].sort(
    (left, right) => left.year - right.year || left.title.localeCompare(right.title),
  );

  function renderCatalogForm(isEditing = false) {
    return (
      <form
        className={`catalog-form ${isEditing ? "modal-catalog-form" : ""}`}
        onSubmit={addDraftTrack}
      >
        <input
          aria-label="Título"
          placeholder="Título"
          value={draft.title}
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
        />
        <input
          aria-label="Artista"
          placeholder="Artista"
          value={draft.artist}
          onChange={(event) =>
            setDraft((current) => ({ ...current, artist: event.target.value }))
          }
        />
        <input
          aria-label="Año"
          max={2100}
          min={1900}
          placeholder="Año"
          type="number"
          value={draft.year}
          onChange={(event) =>
            setDraft((current) => ({ ...current, year: event.target.value }))
          }
        />
        <select
          aria-label="Categoría principal"
          value={draft.mode}
          onChange={(event) =>
            updateDraftPrimaryMode(event.target.value as TrackMode)
          }
        >
          {TRACK_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {mode}
            </option>
          ))}
        </select>
        <input
          aria-label="Fuente de audio"
          className="wide-input"
          placeholder="YouTube o /audio/archivo.mp3"
          value={draft.audioSrc}
          onChange={(event) =>
            setDraft((current) => ({ ...current, audioSrc: event.target.value }))
          }
        />

        <div className="category-picker">
          <span className="field-label">Categorías</span>
          <div className="category-options">
            {TRACK_MODES.map((mode) => (
              <label className="check-row category-option" key={mode}>
                <input
                  checked={modesForTrack(draft.mode, draft.modes).includes(mode)}
                  type="checkbox"
                  onChange={() => toggleDraftMode(mode)}
                />
                {mode}
              </label>
            ))}
          </div>
        </div>

        {EXTRA_FIELDS_BY_MODE[draft.mode].map((fieldId) => (
          <input
            aria-label={fieldLabel(fieldId)}
            key={fieldId}
            placeholder={fieldLabel(fieldId)}
            value={draft.extra[fieldId] ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                extra: {
                  ...current.extra,
                  [fieldId]: event.target.value,
                },
              }))
            }
          />
        ))}

        <button className="primary-button" type="submit">
          {isEditing ? "Guardar cambios" : "Añadir canción"}
        </button>
        {isEditing && (
          <button
            className="secondary-button"
            type="button"
            onClick={cancelEditingTrack}
          >
            Cancelar
          </button>
        )}
      </form>
    );
  }

  return (
    <main className="game-shell">
      <section className="command-band">
        <div className="brand-lockup">
          <span className="brand-mark">T</span>
          <div>
            <h1>Twinkster</h1>
          </div>
          <div className="header-actions">
          <button
            aria-label={
              theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
            }
            className="theme-toggle"
            title={
              theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
            }
            type="button"
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
          >
            <span className={theme === "dark" ? "is-active" : ""}>☾</span>
            <span className={theme === "light" ? "is-active" : ""}>☀</span>
          </button>
          <button
            aria-label={catalogPanelOpen ? "Cerrar catalogo" : "Abrir catalogo"}
            className={`catalog-toggle ${catalogPanelOpen ? "is-active" : ""}`}
            title={catalogPanelOpen ? "Cerrar catalogo" : "Abrir catalogo"}
            type="button"
            onClick={() => setCatalogPanelOpen((current) => !current)}
          >
            ▦
          </button>
          </div>
        </div>
        <div className="scoreboard" aria-label="Marcador">
          {participants.map((participant) => (
            <button
              className={`score-pill ${
                participant.key === activeKey ? "is-active" : ""
              }`}
              key={participant.key}
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  handView: participant.key,
                  followTurnHand: false,
                }))
              }
              title={`Ver mano de ${participant.name}`}
            >
              <span>{participant.name}</span>
              <strong>{participant.score}</strong>
            </button>
          ))}
        </div>
      </section>

      <div
        className={`workspace-grid ${
          setupPanelCollapsed ? "setup-collapsed" : ""
        }`}
      >
        {setupPanelCollapsed ? (
          <aside
            className="panel setup-panel setup-panel-collapsed"
            aria-label="Mesa minimizada"
          >
            <div>
              <p className="eyebrow">Mesa</p>
              <h2>Partida</h2>
            </div>
            <div className="setup-summary">
              <div className="setup-summary-row">
                <span>Turno</span>
                <strong>{state.round}</strong>
              </div>
              <div className="setup-summary-row">
                <span>Jugador</span>
                <strong>{activeParticipant?.name ?? "Sin participantes"}</strong>
              </div>
              <div className="setup-summary-row">
                <span>Modo</span>
                <strong>{state.mode}</strong>
              </div>
              <div className="setup-summary-row">
                <span>Puntos max.</span>
                <strong>{maxPoints}</strong>
              </div>
              <div className="setup-summary-row">
                <span>Canciones</span>
                <strong>{eligibleCatalog.length}</strong>
              </div>
            </div>
            <button
              className="primary-button setup-open-button"
              type="button"
              onClick={() => setSetupPanelCollapsed(false)}
            >
              Abrir mesa
            </button>
          </aside>
        ) : (
        <section className="panel setup-panel" aria-labelledby="setup-title">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Mesa</p>
              <h2 id="setup-title">Configuración</h2>
            </div>
            <div className="button-row">
              <button
                aria-label="Minimizar mesa"
                className="icon-button setup-collapse-button"
                title="Minimizar mesa"
                type="button"
                onClick={() => setSetupPanelCollapsed(true)}
              >
                ←
              </button>
              <button className="secondary-button" type="button" onClick={newGame}>
                Nueva partida
              </button>
            </div>
          </div>

          <div className="control-stack">
            <label className="field-label" htmlFor="mode-select">
              Modo
            </label>
            <select
              id="mode-select"
              value={state.mode}
              onChange={(event) => updateMode(event.target.value as GameMode)}
            >
              {MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          <div className="segmented" aria-label="Tipo de partida">
            <button
              className={state.structure === "individual" ? "selected" : ""}
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  structure: "individual",
                  turnIndex: 0,
                  handView: `player:${current.players[0]?.id ?? ""}`,
                }))
              }
            >
              Individual
            </button>
            <button
              className={state.structure === "teams" ? "selected" : ""}
              type="button"
              onClick={() =>
                setState((current) => ({
                  ...current,
                  structure: "teams",
                  turnIndex: 0,
                  handView: `team:${current.teams[0]?.id ?? ""}`,
                }))
              }
            >
              Equipos
            </button>
          </div>

          <div className="field-grid compact">
            <label className="field-label" htmlFor="player-count">
              Jugadores
            </label>
            <input
              id="player-count"
              max={16}
              min={1}
              type="number"
              value={state.players.length}
              onChange={(event) => setPlayerCount(Number(event.target.value))}
            />
          </div>

          <div className="list-block">
            <div className="mini-heading">Nombres</div>
            {state.players.map((player) => (
              <div className="player-row" key={player.id}>
                <input
                  aria-label={`Nombre de ${player.name}`}
                  value={player.name}
                  onChange={(event) =>
                    updatePlayer(player.id, { name: event.target.value })
                  }
                />
                {state.structure === "teams" && (
                  <select
                    aria-label={`Equipo de ${player.name}`}
                    value={player.teamId ?? ""}
                    onChange={(event) =>
                      updatePlayer(player.id, {
                        teamId: event.target.value || null,
                      })
                    }
                  >
                    <option value="">Sin equipo</option>
                    {state.teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>

          {state.structure === "teams" && (
            <div className="list-block">
              <div className="list-title-row">
                <div className="mini-heading">Equipos</div>
                <button className="icon-button text" type="button" onClick={addTeam}>
                  Añadir
                </button>
              </div>
              {state.teams.map((team) => (
                <div className="team-row" key={team.id}>
                  <input
                    aria-label={`Nombre de ${team.name}`}
                    value={team.name}
                    onChange={(event) =>
                      updateTeam(team.id, { name: event.target.value })
                    }
                  />
                  <button
                    className="icon-button"
                    disabled={state.teams.length <= 1}
                    title="Eliminar equipo"
                    type="button"
                    onClick={() => removeTeam(team.id)}
                  >
                    X
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="list-block">
            <div className="mini-heading">Adivinar</div>
            <div className="guess-field-list">
              {Object.entries(groupedFields).map(([group, fields]) => (
                <div className="field-group" key={group}>
                  <span>{group}</span>
                  {fields.map((field) => (
                    <label className="check-row" key={field.id}>
                      <input
                        checked={state.selectedFields.includes(field.id)}
                        type="checkbox"
                        onChange={() => toggleField(field.id)}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <label className="check-row stand-alone">
            <input
              checked={state.avoidRepeats}
              type="checkbox"
              onChange={(event) =>
                setState((current) => ({
                  ...current,
                  avoidRepeats: event.target.checked,
                }))
              }
            />
            Evitar repetidas hasta agotar el modo
          </label>

          <label className="check-row stand-alone">
            <input
              checked={state.includeOtGalaInGlobales}
              type="checkbox"
              onChange={(event) => toggleOtGalaInGlobales(event.target.checked)}
            />
            Incluir galas de OT en Globales
          </label>
        </section>
        )}

        <section className="round-console" aria-labelledby="round-title">
          <div className="round-top">
            <div>
              <p className="eyebrow">Turno {state.round}</p>
              <h2 id="round-title">
                {activeParticipant ? activeParticipant.name : "Sin participantes"}
              </h2>
              {activeParticipant?.members && (
                <p className="muted-line">{activeParticipant.members}</p>
              )}
            </div>
            <div className="round-meta">
              <span>{state.mode}</span>
              <strong>{maxPoints} puntos máx.</strong>
            </div>
          </div>

          <div className="track-blind">
            <div>
              <p className="eyebrow">Canción seleccionada</p>
              <h3>{state.revealed && currentTrack ? currentTrack.title : "Oculta"}</h3>
              <p>
                {state.revealed && currentTrack
                  ? `${currentTrack.artist} · ${currentTrack.year}`
                  : `${eligibleCatalog.length} canciones disponibles en este modo`}
              </p>
            </div>
            <button
              className="primary-button"
              disabled={isScoreAnimating}
              type="button"
              onClick={pickTrack}
            >
              Elegir canción
            </button>
          </div>

          <audio
            key={currentTrack?.id ?? "no-track"}
            onError={() => setAudioStatus("No se pudo cargar el audio.")}
            ref={audioRef}
            src={
              currentTrack?.audioSrc && currentSourceKind === "audio"
                ? currentTrack.audioSrc
                : undefined
            }
          />

          {currentYoutubeId && (
            <aside
              className={`youtube-dock ${youtubeDockOpen ? "is-open" : "is-compact"}`}
              aria-label="Reproductor visible de YouTube"
            >
              <div className="youtube-dock-header">
                <button
                  className="youtube-dock-toggle"
                  type="button"
                  onClick={() =>
                    youtubeDockOpen ? collapseYouTubeDock() : setYoutubeDockOpen(true)
                  }
                >
                  <span>YT</span>
                  {youtubeDockOpen ? "Minimizar" : "Mostrar"}
                </button>
                {youtubeDockOpen && (
                  <a
                    href={currentTrack?.audioSrc}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Abrir
                  </a>
                )}
              </div>
              {youtubeDockOpen && (
                <iframe
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                  height="200"
                  key={currentYoutubeId}
                  onLoad={handleYouTubeReady}
                  ref={youtubeFrameRef}
                  src={currentYoutubeEmbedUrl}
                  title="Reproductor visible de YouTube"
                  width="200"
                />
              )}
            </aside>
          )}

          <div className="transport-bar" aria-label="Controles de reproducción">
            <button type="button" onClick={playAudio}>
              Play
            </button>
            <button type="button" onClick={pauseAudio}>
              Pausa / reanudar
            </button>
            <button type="button" onClick={restartAudio}>
              Reiniciar
            </button>
            <button type="button" onClick={forwardAudio}>
              +15s
            </button>
          </div>
          <div className="audio-state">
            {currentTrack?.audioSrc
              ? currentSourceKind === "youtube"
                ? audioStatus || "Canción mostrada"
                : currentSourceKind === "spotify"
                  ? "Spotify guardado como enlace externo"
                  : audioStatus || "Audio listo"
              : "Sin fuente asignada"}
          </div>

          <div className="reveal-zone">
            <div className="guess-brief" aria-label="Campos que hay que adivinar">
              <span>Hay que adivinar</span>
              <div>
                {state.selectedFields.map((fieldId) => (
                  <strong key={fieldId}>{fieldLabel(fieldId)}</strong>
                ))}
              </div>
            </div>

            <button
              className="reveal-button"
              disabled={!currentTrack}
              type="button"
              onClick={() =>
                setState((current) => ({ ...current, revealed: true }))
              }
            >
              Revelar información
            </button>

            {state.revealed && currentTrack && (
              <div className="answers-grid">
                {state.selectedFields.map((fieldId) => (
                  <div className="answer-card" key={fieldId}>
                    <span>{fieldLabel(fieldId)}</span>
                    <strong>{valueForField(currentTrack, fieldId)}</strong>
                  </div>
                ))}
              </div>
            )}
          </div>

          {state.revealed && currentTrack && (
            <div className={`score-panel ${isScoreAnimating ? "is-scoring" : ""}`}>
              {scoreAnimation && (
                <div
                  className="score-burst"
                  key={scoreAnimation.id}
                  role="status"
                  aria-live="polite"
                >
                  <strong>+{scoreAnimation.points}</strong>
                  <span>
                    {scoreAnimation.points === 1 ? "punto" : "puntos"}
                  </span>
                  <small>{scoreAnimation.participantName}</small>
                  <em>Siguiente: {scoreAnimation.nextName}</em>
                </div>
              )}
              <div className="score-panel-head">
                <div>
                  <p className="eyebrow">Puntuación manual</p>
                  <h3>
                    {currentPoints} de {maxPoints}
                  </h3>
                </div>
                <button
                  className="primary-button"
                  disabled={isScoreAnimating}
                  type="button"
                  onClick={scoreAndNext}
                >
                  Sumar {currentPoints} y pasar
                </button>
              </div>
              <div className="score-checks">
                {state.selectedFields.map((fieldId) => (
                  <label className="check-row score-check" key={fieldId}>
                    <input
                      checked={state.scoreFields.includes(fieldId)}
                      disabled={isScoreAnimating}
                      type="checkbox"
                      onChange={() => toggleScoreField(fieldId)}
                    />
                    {fieldLabel(fieldId)}
                  </label>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel hand-panel" aria-labelledby="hand-title">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Cartas</p>
              <h2 id="hand-title">Mano visible</h2>
            </div>
            <label className="switch-row">
              <input
                checked={state.followTurnHand}
                type="checkbox"
                onChange={(event) =>
                  setState((current) => ({
                    ...current,
                    followTurnHand: event.target.checked,
                    handView: event.target.checked ? activeKey : current.handView,
                  }))
                }
              />
              Seguir turno
            </label>
          </div>

          <div className="hand-summary">
            <strong>{handParticipant?.name ?? "Sin mano"}</strong>
            <span>{sortedCards.length} cartas</span>
          </div>

          <div className="timeline">
            {sortedCards.length ? (
              sortedCards.map((card) => (
                <article
                  className={`won-card ${
                    card.kind === "timeline-year" ? "timeline-seed-card" : ""
                  }`}
                  key={card.id}
                >
                  <span className="year-badge">{card.year}</span>
                  {card.kind !== "timeline-year" && (
                    <>
                      <div>
                        <h3>{card.title}</h3>
                        <p>{card.artist}</p>
                      </div>
                      <span className="point-badge">+{card.points}</span>
                    </>
                  )}
                </article>
              ))
            ) : (
              <div className="empty-state">Sin cartas conseguidas</div>
            )}
          </div>
        </section>
      </div>

      {catalogPanelOpen && (
      <section className="panel catalog-panel" aria-labelledby="catalog-title">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Audio / YouTube</p>
            <h2 id="catalog-title">Catálogo</h2>
          </div>
          <div className="button-row">
            <label className="secondary-button file-button">
              Importar JSON
              <input
                accept="application/json"
                type="file"
                onChange={(event) => {
                  void importCatalog(event.target.files?.[0]);
                  event.target.value = "";
                }}
              />
            </label>
            <button className="secondary-button" type="button" onClick={exportCatalog}>
              Exportar
            </button>
            <button className="danger-button" type="button" onClick={resetAll}>
              Borrar local
            </button>
          </div>
        </div>

        {!editingTrackId && (
        <form className="catalog-form" onSubmit={addDraftTrack}>
          <input
            aria-label="Título"
            placeholder="Título"
            value={draft.title}
            onChange={(event) =>
              setDraft((current) => ({ ...current, title: event.target.value }))
            }
          />
          <input
            aria-label="Artista"
            placeholder="Artista"
            value={draft.artist}
            onChange={(event) =>
              setDraft((current) => ({ ...current, artist: event.target.value }))
            }
          />
          <input
            aria-label="Año"
            max={2100}
            min={1900}
            placeholder="Año"
            type="number"
            value={draft.year}
            onChange={(event) =>
              setDraft((current) => ({ ...current, year: event.target.value }))
            }
          />
          <select
            aria-label="Categoría principal"
            value={draft.mode}
            onChange={(event) =>
              updateDraftPrimaryMode(event.target.value as TrackMode)
            }
          >
            {TRACK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
          <input
            aria-label="Fuente de audio"
            className="wide-input"
            placeholder="YouTube o /audio/archivo.mp3"
            value={draft.audioSrc}
            onChange={(event) =>
              setDraft((current) => ({ ...current, audioSrc: event.target.value }))
            }
          />

          <div className="category-picker">
            <span className="field-label">Categorías</span>
            <div className="category-options">
              {TRACK_MODES.map((mode) => (
                <label className="check-row category-option" key={mode}>
                  <input
                    checked={modesForTrack(draft.mode, draft.modes).includes(mode)}
                    type="checkbox"
                    onChange={() => toggleDraftMode(mode)}
                  />
                  {mode}
                </label>
              ))}
            </div>
          </div>

          {EXTRA_FIELDS_BY_MODE[draft.mode].map((fieldId) => (
            <input
              aria-label={fieldLabel(fieldId)}
              key={fieldId}
              placeholder={fieldLabel(fieldId)}
              value={draft.extra[fieldId] ?? ""}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  extra: {
                    ...current.extra,
                    [fieldId]: event.target.value,
                  },
                }))
              }
            />
          ))}

          <button className="primary-button" type="submit">
            {editingTrackId ? "Guardar cambios" : "Añadir canción"}
          </button>
          {editingTrackId && (
            <button
              className="secondary-button"
              type="button"
              onClick={cancelEditingTrack}
            >
              Cancelar
            </button>
          )}
        </form>
        )}

        <div className="bulk-import">
          <div>
            <label className="field-label" htmlFor="bulk-import">
              Importacion masiva
            </label>
            <p>
              Una URL por linea, o: titulo | artista | año | categorias | URL.
              Puedes separar varias categorias con coma o +.
            </p>
          </div>
          <textarea
            id="bulk-import"
            placeholder={
              "https://youtu.be/...\nTitulo | Artista | 2018 | Globales, Pop | https://youtube.com/watch?v=..."
            }
            value={bulkText}
            onChange={(event) => setBulkText(event.target.value)}
          />
          <div className="bulk-import-actions">
            <button
              className="primary-button"
              disabled={!bulkText.trim()}
              type="button"
              onClick={importBulkTracks}
            >
              Importar lineas
            </button>
            <button
              className="secondary-button"
              disabled={!bulkText.trim()}
              type="button"
              onClick={() => setBulkText("")}
            >
              Limpiar
            </button>
          </div>
        </div>

        {catalogStatus && <div className="status-line">{catalogStatus}</div>}

        <div className="catalog-toolbar" aria-label="Filtros del catalogo">
          <div className="catalog-filter-group">
            <span className="field-label">Categoria</span>
            <div className="catalog-filter-tabs">
              {CATALOG_FILTER_MODES.map((mode) => (
                <button
                  className={`filter-chip ${
                    catalogFilterMode === mode ? "is-active" : ""
                  }`}
                  key={mode}
                  type="button"
                  onClick={() => setCatalogFilterMode(mode)}
                >
                  {mode}
                  <span>{catalogFilterCounts.get(mode) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="catalog-controls">
            <label className="catalog-control">
              <span className="field-label">Buscar</span>
              <input
                placeholder="Titulo, artista, año..."
                value={catalogSearch}
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </label>
            <label className="catalog-control">
              <span className="field-label">Ordenar</span>
              <select
                value={catalogSort}
                onChange={(event) =>
                  setCatalogSort(event.target.value as CatalogSortOption)
                }
              >
                {CATALOG_SORT_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="secondary-button"
              disabled={!hasCatalogFilters}
              type="button"
              onClick={() => {
                setCatalogFilterMode("Todo");
                setCatalogSearch("");
                setCatalogSort("year-desc");
              }}
            >
              Limpiar filtros
            </button>
          </div>

          <div className="catalog-result-count">
            Mostrando {visibleCatalog.length} de {state.catalog.length} canciones
          </div>
        </div>

        {visibleCatalog.length ? (
          <div className="catalog-list">
            {visibleCatalog.map((track) => (
            <article className="catalog-row" key={track.id}>
              <div>
                <strong>{track.title}</strong>
                <span>
                  {track.artist} · {track.year} · {displayTrackModes(track)}
                </span>
              </div>
              <div className="catalog-actions">
                <span
                  aria-label={sourceTagLabel(track.audioSrc)}
                  className={`source-tag ${getSourceKind(track.audioSrc)}`}
                  role="img"
                  title={sourceTagLabel(track.audioSrc)}
                >
                  {sourceTagText(track.audioSrc)}
                </span>
                <button
                  className="icon-button text catalog-edit-button"
                  title="Editar canción"
                  type="button"
                  onClick={() => startEditingTrack(track)}
                >
                  Editar
                </button>
                <button
                  className="icon-button"
                  title="Eliminar canción"
                  type="button"
                  onClick={() => removeTrack(track.id, track.title)}
                >
                  X
                </button>
              </div>
            </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            No hay canciones que coincidan con esos filtros.
          </div>
        )}
      </section>
      )}

      {editingTrackId && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              cancelEditingTrack();
            }
          }}
        >
          <section
            aria-labelledby="edit-track-title"
            aria-modal="true"
            className="modal-card"
            role="dialog"
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">Audio / YouTube</p>
                <h2 id="edit-track-title">
                  Editar {editingTrack?.title ?? "canción"}
                </h2>
              </div>
              <button
                aria-label="Cerrar edición"
                className="icon-button modal-close"
                title="Cerrar"
                type="button"
                onClick={cancelEditingTrack}
              >
                X
              </button>
            </div>
            {renderCatalogForm(true)}
          </section>
        </div>
      )}
    </main>
  );
}
