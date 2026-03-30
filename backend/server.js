// backend/server.js
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, '../frontend')));

// Configurar ruta de base de datos
// En Render, usamos /data (persistente), local usamos carpeta database
let dbPath;
if (process.env.RENDER) {
    // En Render, usar el disco persistente
    const dataDir = '/data';
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    dbPath = path.join(dataDir, 'votacion.db');
    console.log('📀 Usando base de datos persistente en:', dbPath);
} else {
    // Localmente
    const dbDir = path.join(__dirname, 'database');
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }
    dbPath = path.join(dbDir, 'votacion.db');
    console.log('💻 Usando base de datos local en:', dbPath);
}

let db;

// Inicializar base de datos
async function initDB() {
    db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });
    
    // Crear tablas
    await db.exec(`
        CREATE TABLE IF NOT EXISTS usuarios (
            cedula TEXT PRIMARY KEY,
            nombre TEXT NOT NULL,
            password TEXT NOT NULL,
            rol TEXT NOT NULL
        );
        
        CREATE TABLE IF NOT EXISTS votantes (
            cedula TEXT PRIMARY KEY,
            nombre_completo TEXT NOT NULL,
            seccional TEXT,
            mesa INTEGER,
            orden INTEGER,
            lugar_votacion TEXT,
            distrito TEXT,
            seccional_nombre TEXT
        );
        
        CREATE TABLE IF NOT EXISTS pagos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cedula TEXT NOT NULL,
            cajero TEXT NOT NULL,
            fecha DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (cedula) REFERENCES votantes(cedula)
        );
        
        CREATE INDEX IF NOT EXISTS idx_pagos_cedula ON pagos(cedula);
    `);
    
    // Insertar usuario admin por defecto (si no existe)
    const adminExists = await db.get('SELECT * FROM usuarios WHERE cedula = ?', ['admin']);
    if (!adminExists) {
        await db.run(
            'INSERT INTO usuarios (cedula, nombre, password, rol) VALUES (?, ?, ?, ?)',
            ['admin', 'Administrador', 'admin123', 'admin']
        );
        console.log('✅ Usuario admin creado: admin / admin123');
    }
    
    // Insertar usuario caja de ejemplo
    const cajaExists = await db.get('SELECT * FROM usuarios WHERE cedula = ?', ['caja1']);
    if (!cajaExists) {
        await db.run(
            'INSERT INTO usuarios (cedula, nombre, password, rol) VALUES (?, ?, ?, ?)',
            ['caja1', 'Cajero 1', 'caja123', 'caja']
        );
        console.log('✅ Usuario caja creado: caja1 / caja123');
    }
    
    console.log('✅ Base de datos inicializada correctamente');
}

// ==================== ENDPOINTS API ====================

// Login
app.post('/api/login', async (req, res) => {
    const { cedula, password } = req.body;
    
    try {
        const user = await db.get(
            'SELECT cedula, nombre, rol FROM usuarios WHERE cedula = ? AND password = ?',
            [cedula, password]
        );
        
        if (!user) {
            return res.status(401).json({ error: 'Credenciales incorrectas' });
        }
        
        res.json({ success: true, usuario: user });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener total de votantes
app.get('/api/total-votantes', async (req, res) => {
    try {
        const result = await db.get('SELECT COUNT(*) as total FROM votantes');
        res.json({ total: result.total });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener pagos realizados
app.get('/api/pagos', async (req, res) => {
    try {
        const pagos = await db.all('SELECT cedula, cajero, fecha FROM pagos ORDER BY fecha DESC');
        res.json(pagos);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Buscar votante por cédula
app.get('/api/votante/:cedula', async (req, res) => {
    const { cedula } = req.params;
    const cedulaLimpia = cedula.toString().replace(/\D/g, '');
    
    try {
        const votante = await db.get(
            `SELECT cedula, nombre_completo, seccional, mesa, orden, 
                    lugar_votacion, distrito, seccional_nombre 
             FROM votantes 
             WHERE cedula = ?`,
            [cedulaLimpia]
        );
        
        if (!votante) {
            return res.status(404).json({ error: 'Votante no encontrado' });
        }
        
        res.json(votante);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Registrar pago
app.post('/api/pagar', async (req, res) => {
    const { cedula, cajero } = req.body;
    const cedulaLimpia = cedula.toString().replace(/\D/g, '');
    
    try {
        // Verificar si ya pagó
        const existe = await db.get('SELECT id FROM pagos WHERE cedula = ?', [cedulaLimpia]);
        
        if (existe) {
            return res.status(400).json({ error: 'Este votante ya pagó' });
        }
        
        // Registrar pago
        await db.run(
            'INSERT INTO pagos (cedula, cajero, fecha) VALUES (?, ?, datetime("now"))',
            [cedulaLimpia, cajero]
        );
        
        res.json({ success: true, message: 'Pago registrado' });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Eliminar pago (solo admin)
app.delete('/api/pagos/:cedula', async (req, res) => {
    const { cedula } = req.params;
    const cedulaLimpia = cedula.toString().replace(/\D/g, '');
    
    try {
        await db.run('DELETE FROM pagos WHERE cedula = ?', [cedulaLimpia]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Obtener usuarios
app.get('/api/usuarios', async (req, res) => {
    try {
        const usuarios = await db.all('SELECT cedula, nombre, rol FROM usuarios ORDER BY nombre');
        res.json(usuarios);
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Crear usuario
app.post('/api/usuarios', async (req, res) => {
    const { cedula, nombre, password, rol } = req.body;
    const cedulaLimpia = cedula.toString().replace(/\D/g, '');
    
    try {
        await db.run(
            'INSERT INTO usuarios (cedula, nombre, password, rol) VALUES (?, ?, ?, ?)',
            [cedulaLimpia, nombre, password, rol]
        );
        res.json({ success: true });
    } catch (error) {
        if (error.message.includes('UNIQUE')) {
            res.status(400).json({ error: 'La cédula ya está registrada' });
        } else {
            console.error('Error:', error);
            res.status(500).json({ error: 'Error del servidor' });
        }
    }
});

// Eliminar usuario
app.delete('/api/usuarios/:cedula', async (req, res) => {
    const { cedula } = req.params;
    const cedulaLimpia = cedula.toString().replace(/\D/g, '');
    
    if (cedulaLimpia === 'admin') {
        return res.status(400).json({ error: 'No se puede eliminar al administrador principal' });
    }
    
    try {
        await db.run('DELETE FROM usuarios WHERE cedula = ?', [cedulaLimpia]);
        res.json({ success: true });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Error del servidor' });
    }
});

// Iniciar servidor
async function start() {
    await initDB();
    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════════╗
║     SISTEMA DE VOTACIÓN - SERVIDOR ACTIVO              ║
╠════════════════════════════════════════════════════════╣
║  URL: https://sistema-votacion.onrender.com            ║
║  Puerto: ${PORT}                                         ║
╠════════════════════════════════════════════════════════╣
║  Usuarios por defecto:                                 ║
║  Admin:    admin / admin123                            ║
║  Cajero:   caja1 / caja123                             ║
╚════════════════════════════════════════════════════════╝
        `);
    });
}

start();