import { Home, Map, Store } from "lucide-react";
import { type Category } from "./types";

type Props = {
  onSelect: (cat: Category) => void;
};

export default function CategorySelector({ onSelect }: Props) {
  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Nuevo Activo</h1>
        <p className="mt-1 text-slate-500">Seleccioná la categoría principal del activo que deseás cargar.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button onClick={() => onSelect("tradicional")} className="group text-left bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:border-blue-500 hover:ring-4 hover:ring-blue-500/10 transition-all">
          <div className="h-14 w-14 bg-indigo-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-indigo-200">
            <Home className="h-7 w-7 text-indigo-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Inmobiliaria Tradicional</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Ideal para carga de casas, departamentos o propiedades individuales estándar.</p>
        </button>

        <button onClick={() => onSelect("loteo")} className="group text-left bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:border-emerald-500 hover:ring-4 hover:ring-emerald-500/10 transition-all">
          <div className="h-14 w-14 bg-emerald-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-emerald-200">
            <Map className="h-7 w-7 text-emerald-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Desarrollos y Loteos</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Terrenos con datos específicos como manzana, número de lote y servicios de infraestructura.</p>
        </button>

        <button onClick={() => onSelect("comercial")} className="group text-left bg-white rounded-3xl p-6 border border-slate-200 shadow-sm hover:border-amber-500 hover:ring-4 hover:ring-amber-500/10 transition-all">
          <div className="h-14 w-14 bg-amber-100 rounded-2xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform border border-amber-200">
            <Store className="h-7 w-7 text-amber-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">Comercial</h3>
          <p className="text-sm text-slate-500 leading-relaxed">Cocheras, locales comerciales y oficinas con variables de piso y ubicación interna.</p>
        </button>
      </div>
    </div>
  );
}
