import {
  inferLeadInterestCategory,
  type Lead,
  type LeadInterest,
  type LeadInterestCategory,
  type Property,
} from "@/data/admin-sample";

type InterestDraft = {
  category?: LeadInterestCategory;
  projectId?: string;
  propertyId?: string;
  unitId?: string;
  preferences?: string;
  notes?: string;
};

function optionalText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function unique(values: Array<string | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function findProperty(properties: Property[], id: string | undefined) {
  return id ? properties.find((property) => property.id === id) : undefined;
}

export function isProjectUnit(property: Property | undefined) {
  return Boolean(property?.projectId || property?.unitNumber || property?.sectorName);
}

export function createLeadInterest(
  companyId: string,
  draft: InterestDraft = {},
  now: string = new Date().toISOString(),
): LeadInterest {
  return {
    id: crypto.randomUUID(),
    companyId,
    category: draft.category,
    projectId: optionalText(draft.projectId),
    propertyId: optionalText(draft.propertyId),
    unitId: optionalText(draft.unitId),
    preferences: optionalText(draft.preferences),
    notes: optionalText(draft.notes),
    createdAt: now,
    updatedAt: now,
  };
}

export function createInterestForProperty(lead: Lead, property: Property): LeadInterest {
  const unit = isProjectUnit(property);
  return createLeadInterest(lead.companyId, {
    category: inferLeadInterestCategory(property),
    projectId: property.projectId,
    propertyId: unit ? undefined : property.id,
    unitId: unit ? property.id : undefined,
  });
}

export function normalizeLeadInterests(lead: Lead, properties: Property[]): LeadInterest[] {
  if (Array.isArray(lead.interests)) {
    return lead.interests
      .filter((interest) => interest.companyId === lead.companyId)
      .map((interest) => ({
        ...interest,
        category: interest.category,
        projectId: optionalText(interest.projectId),
        propertyId: optionalText(interest.propertyId),
        unitId: optionalText(interest.unitId),
        preferences: optionalText(interest.preferences),
        notes: optionalText(interest.notes),
      }));
  }

  const legacyUnitIds = new Set(lead.unitIds ?? []);
  const legacyAssetIds = unique([...(lead.propertyIds ?? []), ...(lead.unitIds ?? [])]);

  if (legacyAssetIds.length > 0) {
    return legacyAssetIds.map((assetId, index) => {
      const property = findProperty(properties, assetId);
      const unit = legacyUnitIds.has(assetId) || isProjectUnit(property);
      const timestamp = lead.lastActivity;

      return {
        id: `legacy-${lead.id}-${assetId}`,
        companyId: lead.companyId,
        category: property
          ? inferLeadInterestCategory(property)
          : index === 0
            ? lead.interestCategory
            : undefined,
        projectId: property?.projectId ?? (legacyAssetIds.length === 1 ? lead.projectId : undefined),
        propertyId: unit ? undefined : assetId,
        unitId: unit ? assetId : undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
  }

  if (lead.projectId || lead.interestCategory) {
    return [{
      id: `legacy-${lead.id}-interest`,
      companyId: lead.companyId,
      category: lead.interestCategory,
      projectId: lead.projectId,
      createdAt: lead.lastActivity,
      updatedAt: lead.lastActivity,
    }];
  }

  return [];
}

export function syncLeadWithInterests(
  lead: Lead,
  interests: LeadInterest[],
  properties: Property[],
): Lead {
  if (interests.some((interest) => interest.companyId !== lead.companyId)) {
    throw new Error("Un interés no pertenece a la empresa activa.");
  }

  const normalized = interests.map((interest) => ({
    ...interest,
    projectId: optionalText(interest.projectId),
    propertyId: optionalText(interest.propertyId),
    unitId: optionalText(interest.unitId),
    preferences: optionalText(interest.preferences),
    notes: optionalText(interest.notes),
  }));
  const propertyIds = unique(normalized.flatMap((interest) => [interest.propertyId, interest.unitId]));
  const unitIds = unique(normalized.map((interest) => interest.unitId));
  const firstInterest = normalized[0];
  const firstAsset = findProperty(properties, firstInterest?.unitId ?? firstInterest?.propertyId);

  return {
    ...lead,
    interests: normalized,
    propertyIds,
    unitIds: unitIds.length > 0 ? unitIds : undefined,
    projectId: firstInterest?.projectId ?? firstAsset?.projectId,
    interestCategory: firstInterest?.category ?? (firstAsset ? inferLeadInterestCategory(firstAsset) : undefined),
    lastActivity: new Date().toISOString(),
  };
}

export function getInterestAssetIds(interests: LeadInterest[]) {
  return unique(interests.flatMap((interest) => [interest.propertyId, interest.unitId]));
}

export function getInterestPendingFields(interest: LeadInterest) {
  return [
    !interest.category ? "Categoría" : null,
    !interest.projectId ? "Proyecto" : null,
    !interest.propertyId ? "Propiedad" : null,
    !interest.unitId ? "Unidad" : null,
    !interest.preferences ? "Preferencias" : null,
    !interest.notes ? "Notas" : null,
  ].filter((item): item is string => item !== null);
}
