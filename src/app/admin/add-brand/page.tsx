import { AddBrandPage } from "@/components/admin/AddBrandPage";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Добавить бренд | CASHER",
};

export default function AdminAddBrandRoute() {
  return <AddBrandPage />;
}
