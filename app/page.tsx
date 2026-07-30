import type { Metadata } from "next";
import SpatialDemo from "@/components/SpatialDemo";

export const metadata: Metadata = {
  title: "Spatial DevEx Bridge",
  description:
    "A WebXR proof of concept connecting live CI/CD state to a spatial repair interaction.",
};

export default function Home() {
  return <SpatialDemo />;
}
