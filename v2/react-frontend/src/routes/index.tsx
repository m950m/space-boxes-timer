import { createFileRoute } from "@tanstack/react-router";
import { SpaceBoxes } from "../space-boxes/SpaceBoxes";
export const Route = createFileRoute("/")({ component: SpaceBoxes });
