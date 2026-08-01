"use client";

import type { HeatherLanguage } from "@heather/core";
import { DocumentIngestionPanel } from "./DocumentIngestionPanel";

export function ResearchMaterialsPanel({ locale }: { locale: HeatherLanguage }) { return <DocumentIngestionPanel scope="research" locale={locale} />; }
