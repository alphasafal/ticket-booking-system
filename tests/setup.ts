import { afterAll } from "vitest";
import { prisma } from "@/lib/db/prisma";

afterAll(async () => {
  await prisma.$disconnect();
});
