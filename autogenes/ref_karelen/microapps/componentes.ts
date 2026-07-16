import type { ComponentType } from "react";
import { CobranzaView } from "@/microapps/cobranza/CobranzaView";
import { CuadreView } from "@/microapps/cuadre/CuadreView";
import { CuantoMeToca } from "@/microapps/cuanto-me-toca/CuantoMeToca";
import { DossierView } from "@/microapps/dossier/DossierView";
import { FlujoView } from "@/microapps/flujo/FlujoView";
import { MandadoView } from "@/microapps/mandado/MandadoView";
import { RadarView } from "@/microapps/radar/RadarView";
import { SignatureView } from "@/microapps/signature/SignatureView";
import { SintesisView } from "@/microapps/sintesis/SintesisView";
import { VinculosView } from "@/microapps/vinculos/VinculosView";

/**
 * Unit components, keyed by manifest id. Split from the registry so
 * manifest consumers (stores, services) never pull UI into their bundle.
 */
export const componentes: Record<string, ComponentType> = {
  radar: RadarView,
  dossier: DossierView,
  vinculos: VinculosView,
  sintesis: SintesisView,
  signature: SignatureView,
  cobranza: CobranzaView,
  cuadre: CuadreView,
  "cuanto-me-toca": CuantoMeToca,
  flujo: FlujoView,
  mandado: MandadoView,
};
