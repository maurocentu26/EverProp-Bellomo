// EVP-180: extended client profile (contacts.profile_json.extended, contract of EVP-177 / ContactExtendedProfile.php).
// The form keeps every field as a string; cleanProfile() turns it into the API payload.

export type ProfileAddress = { street: string; floorAndUnit: string; neighborhood: string; city: string; province: string };
export type ProfileAsset = { value: string; typology: string; quantity: string };

export type LeadExtendedProfile = {
  personal: { documentNumber: string; taxId: string; taxCondition: string; nationality: string; maritalStatus: string; birthDate: string; childrenCount: string };
  addresses: ProfileAddress[];
  employment: { employer: string; phone: string; email: string; profession: string; role: string; income: string };
  guarantor: { name: string; documentNumber: string; phone: string; address: string; employer: string; role: string; income: string };
  currentHousing: { status: string; notes: string; assets: ProfileAsset[] };
};

export const HOUSING_STATUS_LABELS: Record<string, string> = {
  AGREGADO: "Agregado",
  LOAN_FOR_USE: "Préstamo de uso",
  TENANT: "Inquilino",
  OWNER: "Propietario",
};

export const TAX_CONDITIONS = ["Consumidor Final", "Responsable Inscripto", "Monotributista", "Exento", "No Responsable"];
export const MARITAL_STATUSES = ["Soltero/a", "Casado/a", "Unión convivencial", "Divorciado/a", "Separado/a", "Viudo/a"];
export const PROVINCES = ["Jujuy", "Salta", "Tucumán", "Catamarca", "Santiago del Estero", "Córdoba", "Buenos Aires", "CABA"];

export const emptyAddress = (): ProfileAddress => ({ street: "", floorAndUnit: "", neighborhood: "", city: "", province: "" });
export const emptyAsset = (): ProfileAsset => ({ value: "", typology: "", quantity: "" });

export function emptyProfile(): LeadExtendedProfile {
  return {
    personal: { documentNumber: "", taxId: "", taxCondition: "", nationality: "", maritalStatus: "", birthDate: "", childrenCount: "" },
    addresses: [],
    employment: { employer: "", phone: "", email: "", profession: "", role: "", income: "" },
    guarantor: { name: "", documentNumber: "", phone: "", address: "", employer: "", role: "", income: "" },
    currentHousing: { status: "", notes: "", assets: [] },
  };
}

const str = (value: unknown) => (value === null || value === undefined ? "" : String(value));

function fill<T extends Record<string, string>>(base: T, raw: unknown): T {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(Object.keys(base).map((key) => [key, str(source[key])])) as T;
}

/** API `profile` (null when never filled; READ_ONLY gets it without DNI, CUIT, incomes nor guarantor) → form state. */
export function mapApiProfile(raw: unknown): LeadExtendedProfile {
  const empty = emptyProfile();
  const api = raw && typeof raw === "object" ? (raw as Record<string, any>) : {};
  return {
    personal: fill(empty.personal, api.personal),
    addresses: Array.isArray(api.addresses) ? api.addresses.map((row: unknown) => fill(emptyAddress(), row)) : [],
    employment: fill(empty.employment, api.employment),
    guarantor: fill(empty.guarantor, api.guarantor),
    currentHousing: {
      status: str(api.currentHousing?.status),
      notes: str(api.currentHousing?.notes),
      assets: Array.isArray(api.currentHousing?.assets) ? api.currentHousing.assets.map((row: unknown) => fill(emptyAsset(), row)) : [],
    },
  };
}

export const rowHasData = (row: Record<string, string>) => Object.values(row).some((value) => value.trim() !== "");

/** Today's date in Argentina (YYYY-MM-DD), so a birthday at 22:00 in Jujuy doesn't count as tomorrow's UTC date. */
export function argentinaToday(now: Date = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
}

/** Whole years between birthDate (YYYY-MM-DD) and today in Argentina; null when empty or invalid. */
export function computeAge(birthDate: string, now: Date = new Date()): number | null {
  const birth = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  if (!birth) return null;
  const [year, month, day] = birth.slice(1).map(Number);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  const [ty, tm, td] = argentinaToday(now).split("-").map(Number);
  const age = ty - year - (tm < month || (tm === month && td < day) ? 1 : 0);
  return age >= 0 ? age : null;
}

const MONEY_MAX = 999_999_999_999;

/** Same limits as ContactExtendedProfile::rules(); returns field path → message. */
export function validateProfile(profile: LeadExtendedProfile, now: Date = new Date()): Record<string, string> {
  const errors: Record<string, string> = {};
  const money = (path: string, value: string) => {
    if (value.trim() === "") return;
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > MONEY_MAX) errors[path] = "Ingresá un monto válido (0 o más).";
  };
  const integer = (path: string, value: string, max: number) => {
    if (value.trim() === "") return;
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > max) errors[path] = `Ingresá un número entero entre 0 y ${max}.`;
  };
  const birth = profile.personal.birthDate;
  if (birth) {
    if (computeAge(birth, now) === null || birth <= "1900-01-01" || birth > argentinaToday(now)) errors["personal.birthDate"] = "Ingresá una fecha de nacimiento válida, posterior a 1900 y no futura.";
  }
  integer("personal.childrenCount", profile.personal.childrenCount, 50);
  const email = profile.employment.email.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors["employment.email"] = "Ingresá un email válido.";
  money("employment.income", profile.employment.income);
  money("guarantor.income", profile.guarantor.income);
  profile.currentHousing.assets.forEach((asset, index) => {
    money(`currentHousing.assets.${index}.value`, asset.value);
    integer(`currentHousing.assets.${index}.quantity`, asset.quantity, 1000);
  });
  if (profile.addresses.length > 10) errors.addresses = "Máximo 10 domicilios.";
  if (profile.currentHousing.assets.length > 20) errors["currentHousing.assets"] = "Máximo 20 bienes.";
  return errors;
}

const NUMERIC = new Set(["income", "value", "childrenCount", "quantity"]);

function cleanObject(block: Record<string, string>) {
  const out: Record<string, string | number | null> = {};
  for (const [key, raw] of Object.entries(block)) {
    const value = raw.trim();
    out[key] = value === "" ? null : NUMERIC.has(key) ? Number(value) : value;
  }
  return Object.values(out).some((value) => value !== null) ? out : null;
}

/**
 * Form state → API `profile` payload. Every object block is sent whole (empty fields as null, so clearing a field
 * clears it server side: the API merges object blocks field by field); an all-empty block goes as null (removed);
 * lists replace the stored list, empty rows dropped.
 * Only users who see the sensitive fields can save (READ_ONLY gets 403), so the payload never wipes hidden data.
 */
export function cleanProfile(profile: LeadExtendedProfile) {
  const housing = cleanObject({ status: profile.currentHousing.status, notes: profile.currentHousing.notes });
  const assets = profile.currentHousing.assets.filter(rowHasData).map((row) => cleanObject(row));
  return {
    personal: cleanObject(profile.personal),
    addresses: profile.addresses.filter(rowHasData).map((row) => cleanObject(row)),
    employment: cleanObject(profile.employment),
    guarantor: cleanObject(profile.guarantor),
    currentHousing: housing || assets.length > 0 ? { ...(housing ?? { status: null, notes: null }), assets } : null,
  };
}

export type ExtendedProfilePayload = ReturnType<typeof cleanProfile>;
export type ProfileSuggestions = { neighborhoods: string[]; cities: string[]; provinces: string[]; taxConditions: string[] };

/** True when the payload carries any data (used to skip sending an empty profile on create). */
export function profileHasData(profile: LeadExtendedProfile) {
  const payload = cleanProfile(profile);
  return Object.values(payload).some((block) => (Array.isArray(block) ? block.length > 0 : block !== null));
}
