/**
 * Standalone seed script to import tashkent-zones.geojson into the database.
 * Run with: node seed-zones.js
 */
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');
const fs = require('node:fs/promises');
const path = require('node:path');

const VALID_ZONE_TYPES = ['RESIDENTIAL', 'INDUSTRIAL', 'COMMERCIAL', 'PUBLIC_INFRA', 'RESTRICTED'];
const VALID_ZONE_STATUSES = ['AVAILABLE', 'IN_AUCTION', 'IN_TENDER', 'AWARDED', 'RESTRICTED'];

async function main() {
  const envContent = await fs.readFile(path.join(__dirname, '.env'), 'utf8');
  const dbUrlMatch = envContent.match(/DATABASE_URL="?([^"\n]+)"?/);
  const connectionString = dbUrlMatch ? dbUrlMatch[1] : 'postgresql://zoning_user:zoning_pass@127.0.0.1:5433/zoning_db';
  
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const filePath = path.resolve(process.cwd(), 'tashkent-zones.geojson');
    console.log(`Reading ${filePath}...`);
    let raw;
    try {
      raw = await fs.readFile(filePath, 'utf8');
    } catch (err) {
      console.error(`Could not read file ${filePath}. Did you run fetch-tashkent-zones.js?`);
      return;
    }
    
    const parsed = JSON.parse(raw);
    const features = Array.isArray(parsed.features) ? parsed.features : [];
    console.log(`Found ${features.length} features in GeoJSON`);

    // Clean up old mock zones and old gap-fills and old fallback
    const deleted = await prisma.zone.deleteMany({
      where: {
        OR: [
          { sourceId: { startsWith: 'mock-tashkent-' } },
          { sourceId: { startsWith: 'gap-fill-' } },
          { sourceId: { startsWith: 'grid-' } },
          { sourceId: { startsWith: 'osm-fallback-' } }
        ]
      }
    });
    console.log(`Deleted ${deleted.count} old mock/gap-fill zones from DB.`);

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const feature of features) {
      const properties = feature.properties || {};
      const sourceId = properties.sourceId || properties.id;
      const geometry = feature.geometry;

      if (!sourceId || !geometry) {
        skipped++;
        continue;
      }

      const type = VALID_ZONE_TYPES.includes(properties.type) ? properties.type : 'RESIDENTIAL';
      const status = VALID_ZONE_STATUSES.includes(properties.status) ? properties.status : 'AVAILABLE';
      const minPrice = typeof properties.minPrice === 'number' ? properties.minPrice : 450000;
      const description = properties.description || null;

      const existing = await prisma.zone.findUnique({
        where: { sourceId }
      });

      if (existing) {
        await prisma.zone.update({
          where: { sourceId },
          data: {
            geometry,
            type,
            status,
            minPrice,
            description
          }
        });
        updated++;
      } else {
        await prisma.zone.create({
          data: {
            sourceId,
            geometry,
            type,
            status,
            minPrice,
            description
          }
        });
        created++;
      }
    }

    console.log(`Import finished: ${created} created, ${updated} updated, ${skipped} skipped.`);

  } catch (error) {
    console.error('Error seeding zones:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
