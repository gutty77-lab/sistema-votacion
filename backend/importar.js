// backend/importar.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function importarVotantes() {
    const jsonPath = path.join(__dirname, '../datos/votantes.json');
    
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ No se encuentra el archivo datos/votantes.json');
        console.log('📝 Crea el archivo con tus datos electorales');
        process.exit(1);
    }
    
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    let votantesArray = [];
    
    if (Array.isArray(data)) {
        votantesArray = data;
    } else if (data.votantes && Array.isArray(data.votantes)) {
        votantesArray = data.votantes;
    } else {
        console.error('❌ Formato JSON no reconocido');
        process.exit(1);
    }
    
    console.log(`📊 Se encontraron ${votantesArray.length} registros`);
    
    // Detectar entorno
    let dbPath;
    if (process.env.RENDER) {
        dbPath = '/data/votacion.db';
    } else {
        dbPath = path.join(__dirname, 'database', 'votacion.db');
    }
    
    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    
    let importados = 0;
    let errores = 0;
    
    for (const item of votantesArray) {
        try {
            const cedula = item.CI || item.cedula || item.CEDULA || '';
            const nombreCompleto = item.NOMBRE_COMPLETO || item.nombreCompleto || item.NOMBRE || '';
            
            if (!cedula || !nombreCompleto) {
                errores++;
                continue;
            }
            
            await db.run(`
                INSERT OR REPLACE INTO votantes 
                (cedula, nombre_completo, seccional, mesa, orden, lugar_votacion, distrito, seccional_nombre)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                cedula,
                nombreCompleto,
                item.SECCIONAL || item.seccional || 'SECCIONAL Nº 244',
                item.MESA || item.mesa || 0,
                item.ORDEN || item.orden || 0,
                item.LUGAR_VOTACION || item.lugarVotacion || '',
                item.DISTRITO || item.distrito || 'SAN ESTANISLAO',
                item.SECCIONAL_NOMBRE || item.seccionalNombre || 'SAN ESTANISLAO'
            ]);
            
            importados++;
            
            if (importados % 1000 === 0) {
                console.log(`   Procesados: ${importados} registros...`);
            }
        } catch (error) {
            errores++;
        }
    }
    
    console.log(`
╔════════════════════════════════════════════════════════╗
║              IMPORTACIÓN COMPLETADA                    ║
╠════════════════════════════════════════════════════════╣
║  ✅ Importados: ${importados.toString().padStart(6)} registros                 ║
║  ❌ Errores:    ${errores.toString().padStart(6)} registros                 ║
╚════════════════════════════════════════════════════════╝
    `);
    
    await db.close();
}

importarVotantes().catch(console.error);