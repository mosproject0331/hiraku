export interface NoteItem {
  title: string;
  summary: string;
  url?: string;
  verified: false;
}

export interface SubsidyItem extends NoteItem {}

export interface ContactItem {
  title: string;
  summary: string;
  url?: string;
  tel?: string;
  verified: false;
}

export interface RegionPack {
  id: string;
  name: string;
  municipality: string;
  ordinances: NoteItem[];
  subsidies: SubsidyItem[];
  contacts: ContactItem[];
  localKnowledge: NoteItem[];
}

import { sandaPack } from './packs/sanda';

const PACKS: RegionPack[] = [sandaPack];

export function listRegionPacks(): { id: string; name: string }[] {
  return PACKS.map((p) => ({ id: p.id, name: p.name }));
}

export function getRegionPack(id: string): RegionPack | undefined {
  return PACKS.find((p) => p.id === id);
}
