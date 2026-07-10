/**
 * Currencies supported by Frankfurter (the ECB reference set) — for the
 * currency picker, so an operator selects codes from a list instead of
 * typing ISO 4217. Only these are safe to query; others would error.
 */
export interface Divisa {
  codigo: string;
  nombre: string;
}

export const DIVISAS: readonly Divisa[] = [
  { codigo: "USD", nombre: "Dólar estadounidense" },
  { codigo: "MXN", nombre: "Peso mexicano" },
  { codigo: "EUR", nombre: "Euro" },
  { codigo: "GBP", nombre: "Libra esterlina" },
  { codigo: "JPY", nombre: "Yen japonés" },
  { codigo: "CAD", nombre: "Dólar canadiense" },
  { codigo: "BRL", nombre: "Real brasileño" },
  { codigo: "CHF", nombre: "Franco suizo" },
  { codigo: "CNY", nombre: "Yuan chino" },
  { codigo: "AUD", nombre: "Dólar australiano" },
  { codigo: "NZD", nombre: "Dólar neozelandés" },
  { codigo: "SEK", nombre: "Corona sueca" },
  { codigo: "NOK", nombre: "Corona noruega" },
  { codigo: "DKK", nombre: "Corona danesa" },
  { codigo: "PLN", nombre: "Zloty polaco" },
  { codigo: "HKD", nombre: "Dólar de Hong Kong" },
  { codigo: "SGD", nombre: "Dólar de Singapur" },
  { codigo: "INR", nombre: "Rupia india" },
  { codigo: "ZAR", nombre: "Rand sudafricano" },
  { codigo: "KRW", nombre: "Won surcoreano" },
  { codigo: "TRY", nombre: "Lira turca" },
  { codigo: "THB", nombre: "Baht tailandés" },
];
