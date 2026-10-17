import React from "react";
import {createRoot} from "react-dom/client";
import {SpaceBoxes} from "./space-boxes/SpaceBoxes";
createRoot(document.getElementById("root")!).render(<React.StrictMode><SpaceBoxes/></React.StrictMode>);
