import React from 'react';
import { AreaContent } from "./area-content";

export default async function AreaDrillDownPage(context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  
  return <AreaContent areaId={params.id} />;
}
