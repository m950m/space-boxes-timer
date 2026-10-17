import { createRoot } from "react-dom/client";
import { SpaceBoxes } from "./SpaceBoxes";
import "./space-boxes.css";
const node = document.getElementById("root");
if (!node) throw new Error("Space Boxes mount point was not found");
createRoot(node).render(<SpaceBoxes/>);
