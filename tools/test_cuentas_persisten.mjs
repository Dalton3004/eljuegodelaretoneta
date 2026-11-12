// Prueba que las cuentas NO se pierdan: nueva carpeta de versión, archivo roto, migración y respaldo.
// Uso: node tools/test_cuentas_persisten.mjs
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const base = mkdtempSync(join(tmpdir(), "liga-pers-"));
const casa = join(base, "casa"); mkdirSync(casa);
let fallos = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FALLA ") + m); if (!c) fallos++; };

// Corre un script en un proceso nuevo (como si fuera otra versión del juego) con HOME falso.
function correr(codigo, env = {}) {
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", codigo], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: casa, USERPROFILE: casa, ...env },
    });
    if (r.status !== 0) console.error(r.stderr);
    return (r.stdout || "").trim().split("\n").filter((l) => !l.startsWith("[persistencia]")).pop();
}
const P = JSON.stringify(join(process.cwd(), "persistencia.js"));

// 1) Se registra en la "versión 1" y la cuenta sigue en la "versión 2" (proceso nuevo, mismo usuario)
correr(`const p = await import(${P}); p.registrar({nombre:"Nico", password:"1234"});`);
const e1 = correr(`const p = await import(${P}); const r = p.entrar({nombre:"Nico", password:"1234"}); console.log(r.status);`);
ok(e1 === "200", "la cuenta sigue existiendo en un proceso nuevo (otra versión del juego)");
ok(existsSync(join(casa, ".liga-chaquito-f8", "liga.json")), "se guarda fuera de la carpeta del proyecto (~/.liga-chaquito-f8)");

// 2) Archivo roto: no se pierde nada, se recupera de la copia
const ruta = join(casa, ".liga-chaquito-f8", "liga.json");
correr(`const p = await import(${P}); p.registrar({nombre:"Ana", password:"abcd"});`);   // genera .bak con Nico
writeFileSync(ruta, "{ esto no es json");
const e2 = correr(`const p = await import(${P}); console.log(p.entrar({nombre:"Nico", password:"1234"}).status);`);
ok(e2 === "200", "con liga.json corrupto, las cuentas se recuperan de la copia (.bak)");
ok(readdirSync(join(casa, ".liga-chaquito-f8")).some((f) => f.includes(".roto-")), "el archivo roto se aparta, no se borra");

// 3) Archivo borrado: se recupera de la copia
rmSync(ruta);
const e3 = correr(`const p = await import(${P}); console.log(p.entrar({nombre:"Nico", password:"1234"}).status);`);
ok(e3 === "200", "si se borra liga.json, se recupera de la copia");

// 4) Migración del data/liga.json viejo (dentro del proyecto) hacia el lugar permanente
const proy = join(base, "proy"); mkdirSync(join(proy, "data"), { recursive: true });
writeFileSync(join(proy, "persistencia.js"), readFileSync("persistencia.js", "utf8"));
const casa2 = join(base, "casa2"); mkdirSync(casa2);
// armamos un liga.json "viejo" con una cuenta usando LIGA_DATA apuntando adentro del proyecto
spawnSync(process.execPath, ["--input-type=module", "-e",
    `const p = await import(${JSON.stringify(join(proy, "persistencia.js"))}); p.registrar({nombre:"Vieja", password:"9999"});`],
    { env: { PATH: process.env.PATH, HOME: join(base, "sinpermiso"), LIGA_DATA: join(proy, "data", "liga.json") } });
ok(existsSync(join(proy, "data", "liga.json")), "(preparación) existe un data/liga.json viejo en el proyecto");
const r4 = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const p = await import(${JSON.stringify(join(proy, "persistencia.js"))}); console.log(p.entrar({nombre:"Vieja", password:"9999"}).status);`],
    { encoding: "utf8", env: { PATH: process.env.PATH, HOME: casa2, USERPROFILE: casa2 } });
ok(r4.stdout.trim().split("\n").pop() === "200", "la cuenta del data/liga.json viejo se migra sola");
ok(existsSync(join(casa2, ".liga-chaquito-f8", "liga.json")), "...y queda en el lugar permanente");

// 5) Respaldo y restauración (fusiona, nunca pisa)
correr(`const p = await import(${P}); p.registrar({nombre:"Ana", password:"abcd"});`);
const casa3 = join(base, "casa3"); mkdirSync(casa3);
const respaldo = correr(`const p = await import(${P}); console.log(JSON.stringify(p.exportarRespaldo()));`);
const parsed = JSON.parse(respaldo);
ok(parsed.cuentas.length >= 2, "el respaldo exporta las cuentas (" + parsed.cuentas.length + ")");
const archivoResp = join(base, "resp.json"); writeFileSync(archivoResp, respaldo);
const e5 = correr(`const p = await import(${P}); import { readFileSync } from "node:fs";
  p.registrar({nombre:"Nueva", password:"zzzz"});
  const r = p.restaurarRespaldo(readFileSync(${JSON.stringify(archivoResp)}, "utf8"));
  console.log(r.body.cuentasAgregadas + "/" + r.body.cuentasTotal + "/" + p.entrar({nombre:"Nico", password:"1234"}).status + "/" + p.entrar({nombre:"Nueva", password:"zzzz"}).status);`,
    { HOME: casa3, USERPROFILE: casa3 });
ok(e5 === "2/3/200/200", "restaurar suma las cuentas del respaldo sin pisar las nuevas (" + e5 + ")");
const mal = correr(`const p = await import(${P}); console.log(p.restaurarRespaldo("basura").status);`, { HOME: casa3, USERPROFILE: casa3 });
ok(mal === "400", "un respaldo inválido se rechaza");

rmSync(base, { recursive: true, force: true });
console.log(fallos ? "\n" + fallos + " fallo(s)" : "\nTodo OK");
process.exit(fallos ? 1 : 0);
