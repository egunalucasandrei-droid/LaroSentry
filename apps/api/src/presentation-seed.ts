import { preparePresentationScenarios } from './presentation-scenarios.js';
import { db } from './db.js';
try {
  console.log(JSON.stringify(await preparePresentationScenarios()));
} finally {
  await db.$disconnect();
}
