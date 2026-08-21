export type AssemblyProgressEntry = {
  collectedCount: number;
  collectedAt?: number;
};

export type AssemblyProgressState = {
  revision: number;
  updatedAt: number;
  updatedBy: string;
  /** key = AssemblyItem.id */
  items: Record<string, AssemblyProgressEntry>;
};
