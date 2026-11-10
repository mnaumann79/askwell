/**
 * The entry of the bundle (docs/project.md §6.5).
 *
 * The loader starts as soon as the customer's page loads the file. It reads
 * its own script tag, so it works whatever the page around it does.
 */

import { init } from "./index";

init();
