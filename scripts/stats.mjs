// Gera os cards de estatísticas (stats.svg e langs.svg) contando repositórios
// públicos E privados. Precisa de um token com acesso de leitura aos repos.
// Uso: GH_TOKEN=... USERNAME=EduardoSanches03 node scripts/stats.mjs
import { writeFile, mkdir } from "node:fs/promises";

const TOKEN = process.env.GH_TOKEN;
const USER = process.env.USERNAME || "EduardoSanches03";

const C = { bg: "#0d1117", border: "#30363d", title: "#e63946", text: "#c9d1d9", muted: "#8b949e" };
const LANG_COLORS = {
  TypeScript: "#3178c6", JavaScript: "#f1e05a", "C#": "#178600", Astro: "#ff5a03",
  HTML: "#e34c26", CSS: "#663399", Kotlin: "#A97BFF", Vue: "#41b883", SCSS: "#c6538c",
  Python: "#3572A5", Java: "#b07219", Shell: "#89e051", Dockerfile: "#384d54",
};

async function gh(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${path}`);
  return { data: await res.json(), link: res.headers.get("link") || "" };
}

async function paginate(path) {
  const out = [];
  for (let page = 1; ; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const { data, link } = await gh(`${path}${sep}per_page=100&page=${page}`);
    out.push(...data);
    if (!link.includes('rel="next"')) return out;
  }
}

const repos = (await paginate("/user/repos?affiliation=owner,collaborator,organization_member"))
  .filter((r) => !r.fork);

let commits = 0, activeRepos = 0;
const langs = {};
for (const r of repos) {
  let n = 0;
  try {
    n = (await paginate(`/repos/${r.full_name}/commits?author=${USER}`)).length;
  } catch { continue; } // repositório vazio
  if (!n) continue;
  commits += n;
  activeRepos++;
  const { data } = await gh(`/repos/${r.full_name}/languages`);
  for (const [lang, bytes] of Object.entries(data)) langs[lang] = (langs[lang] || 0) + bytes;
}

const prs = (await gh(`/search/issues?q=author:${USER}+type:pr`)).data.total_count;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const font = `font-family="Segoe UI, Ubuntu, Helvetica, Arial, sans-serif"`;

function card(width, height, title, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" ${font}>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="4.5" fill="${C.bg}" stroke="${C.border}"/>
  <text x="25" y="35" font-size="18" font-weight="600" fill="${C.title}">${esc(title)}</text>
  ${body}
</svg>`;
}

// Card de estatísticas
const rows = [
  ["Total de commits", commits],
  ["Total de PRs", prs],
  ["Repositórios", activeRepos],
];
const statsBody = rows.map(([label, value], i) => {
  const y = 75 + i * 32;
  return `<circle cx="32" cy="${y - 5}" r="5" fill="${C.title}"/>
  <text x="48" y="${y}" font-size="14" font-weight="600" fill="${C.text}">${esc(label)}:</text>
  <text x="300" y="${y}" font-size="14" font-weight="700" fill="${C.text}">${value}</text>`;
}).join("\n  ") + `
  <text x="25" y="175" font-size="11" fill="${C.muted}">Inclui repositórios privados</text>`;
await mkdir("stats", { recursive: true });
await writeFile("stats/stats.svg", card(400, 195, "Estatísticas do GitHub", statsBody));

// Card de linguagens (dos repositórios com commits seus)
const total = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 6);
let x = 25;
const bar = top.map(([lang, bytes]) => {
  const w = (bytes / total) * 300;
  const seg = `<rect x="${x.toFixed(2)}" y="55" width="${w.toFixed(2)}" height="8" fill="${LANG_COLORS[lang] || C.muted}"/>`;
  x += w;
  return seg;
}).join("");
const items = top.map(([lang, bytes], i) => {
  const cx = 25 + (i % 2) * 150, cy = 95 + Math.floor(i / 2) * 28;
  return `<circle cx="${cx + 5}" cy="${cy - 4}" r="5" fill="${LANG_COLORS[lang] || C.muted}"/>
  <text x="${cx + 16}" y="${cy}" font-size="12" fill="${C.text}">${esc(lang)} ${((bytes / total) * 100).toFixed(1)}%</text>`;
}).join("\n  ");
const langsBody = `<clipPath id="r"><rect x="25" y="55" width="300" height="8" rx="4"/></clipPath>
  <g clip-path="url(#r)">${bar}</g>
  ${items}`;
await writeFile("stats/langs.svg", card(350, 195, "Linguagens mais usadas", langsBody));

console.log({ commits, prs, activeRepos, top: top.map(([l]) => l) });
