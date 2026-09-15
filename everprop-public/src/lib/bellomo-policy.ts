export type MaterialKind = "photo" | "render" | "logo" | "commercial" | "technical" | "brand";
export type MaterialAsset = {
  id: string; project: string | null; file: string; kind: MaterialKind;
  title: string; status: string; version: string; sourceUrl?: string; sourcePath?: string;
};
export type MaterialProject = {
  id: string; name: string; aliases: string[]; location: string;
  tagline: string | null; mapUrl: string | null;
};
export type MaterialAccess = {
  role: string; tenant: string; projectNames: string[];
};
export type PublicMaterialProject = MaterialProject & {
  operationalIds: string[]; assets: Array<Omit<MaterialAsset, "file" | "sourcePath" | "sourceUrl"> & { url: string }>;
};
export type MaterialResponse = {
  role: string; projects: PublicMaterialProject[];
  institutional: PublicMaterialProject["assets"];
  pending: Array<{ title: string; reason: string; project: string | null }>;
};
export function normalizedProjectName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
export function matchesMaterialProject(project: MaterialProject, name: string) {
  return project.aliases.some(alias => normalizedProjectName(alias) === normalizedProjectName(name));
}
export function isMaterialAdministrator(role: string) {
  return role === "TENANT_ADMIN" || role === "SUPER_ADMIN";
}
export function canReadMaterial(asset: MaterialAsset, project: MaterialProject | undefined, access: MaterialAccess) {
  if (access.tenant !== "bellomo") return false;
  if (isMaterialAdministrator(access.role)) return true;
  if (!["SALES_MANAGER", "SALES_ADVISOR", "INVENTORY_MANAGER", "READ_ONLY"].includes(access.role)) return false;
  if (!project || !access.projectNames.some(name => matchesMaterialProject(project, name))) return false;
  if (asset.status === "pending" || asset.kind === "brand") return false;
  if (access.role === "INVENTORY_MANAGER" && asset.kind === "commercial") return false;
  return true;
}
