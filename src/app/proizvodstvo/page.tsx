import { ProductionPanel } from "@/components/production/ProductionPanel";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Производство | CASHER Admin",
};

export default function ProizvodstvoPage() {
  return (
    <div className="min-h-dvh bg-gray-50 px-3 py-4 sm:px-6 sm:py-6">
      <ProductionPanel />
    </div>
  );
}
