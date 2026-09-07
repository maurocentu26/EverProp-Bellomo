export function demoPropertyImage(type: string) {
  const filename = type === "Lote" ? "lote" : type === "Cochera" ? "cochera" : type === "Local" || type === "Oficina" ? "local" : type === "Departamento" ? "departamento" : "casa";
  return `/images/demo-generated/${filename}.webp`;
}
