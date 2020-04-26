// Test default next-on-netlify configuration
const { parse, join } = require('path')
const { copySync, emptyDirSync, existsSync,
        readdirSync, readFileSync, readJsonSync } = require('fs-extra')
const npmRunBuild = require("./helpers/npmRunBuild")

// The name of this test file (without extension)
const FILENAME = parse(__filename).name

// The directory which will be used for testing.
// We simulate a NextJS app within that directory, with pages, and a
// package.json file.
const PROJECT_PATH = join(__dirname, "builds", FILENAME)

// The directory that contains the fixtures, such as NextJS pages,
// NextJS config, and package.json
const FIXTURE_PATH = join(__dirname, "fixtures")

// Capture the output of `npm run build` to verify successful build
let BUILD_OUTPUT

beforeAll(
  async () => {
    // Clear project directory
    emptyDirSync(PROJECT_PATH)
    emptyDirSync(join(PROJECT_PATH, "pages"))

    // Copy NextJS pages and config
    copySync(
      join(FIXTURE_PATH, "pages"),
      join(PROJECT_PATH, "pages")
    )
    copySync(
      join(FIXTURE_PATH, "next.config.js"),
      join(PROJECT_PATH, "next.config.js")
    )

    // Copy package.json
    copySync(
      join(FIXTURE_PATH, "package.json"),
      join(PROJECT_PATH, "package.json")
    )

    // Invoke `npm run build`: Build Next and run next-on-netlify
    const { stdout } = await npmRunBuild({ directory: PROJECT_PATH })
    BUILD_OUTPUT = stdout
  },
  // time out after 30 seconds
  30 * 1000
)

describe('Next', () => {
  test('builds successfully', () => {
    expect(BUILD_OUTPUT).toMatch("Creating an optimized production build...")
    expect(BUILD_OUTPUT).toMatch("Automatically optimizing pages...")
    expect(BUILD_OUTPUT).toMatch("First Load JS shared by all")
  })
})

describe('SSR Pages', () => {
  const router = join(PROJECT_PATH, "functions", "nextRouter")

  test('creates nextRouter.js Netlify Function', () => {
    expect(existsSync(join(router, "nextRouter.js"))).toBe(true)
  })

  test('lists all routes in routes.json', () => {
    // read routes
    const { routes } = readJsonSync(join(router, "routes.json"))

    // check entries
    expect(routes).toContainEqual({
      file: "pages/index.js",
      regex: "^\\/(?:\\/)?$"
    })
    expect(routes).toContainEqual({
      file: "pages/shows/[id].js",
      regex: "^\\/shows\\/([^\\/]+?)(?:\\/)?$"
    })
    expect(routes).toContainEqual({
      file: "pages/shows/[...params].js",
      regex: "^\\/shows(?:\\/((?:[^\\/]+?)(?:\\/(?:[^\\/]+?))*))?(?:\\/)?$"
    })
  })

  test('requires all pages in allPages.js', () => {
    // read allPages.js
    const contents = readFileSync(join(router, "allPages.js"))

    // Convert contents into an array, each line being one element
    const requires = contents.toString().split("\n")

    // Verify presence of require statements
    expect(requires).toContain('require("./pages/index.js")')
    expect(requires).toContain('require("./pages/shows/[id].js")')
    expect(requires).toContain('require("./pages/shows/[...params].js")')
  })

  test('bundles all SSR-pages in /pages', () => {
    const pages = join(PROJECT_PATH, "public", "_next", "pages")

    expect(existsSync(join(router, "pages", "index.js"))).toBe(true)
    expect(existsSync(join(router, "pages", "shows", "[id].js"))).toBe(true)
    expect(existsSync(join(router, "pages", "shows", "[...params].js"))).toBe(true)
  })
})

describe('Static Pages', () => {
  test('copies static pages to public/_next/ directory', () => {
    const pages = join(PROJECT_PATH, "public", "_next", "pages")

    expect(existsSync(join(pages, "static.html"))).toBe(true)
    expect(existsSync(join(pages, "static/[id].html"))).toBe(true)
  })

  test('copies static assets to public/_next/ directory', () => {
    const dirs = readdirSync(join(PROJECT_PATH, "public", "_next", "static"))

    expect(dirs.length).toBe(3)
    expect(dirs).toContain("chunks")
    expect(dirs).toContain("runtime")
  })
})

describe('Routing',() => {
  test('creates Netlify redirects', async () => {
    // Read _redirects file
    const contents = readFileSync(join(PROJECT_PATH, "public", "_redirects"))

    // Convert contents into an array, each line being one element
    const redirects = contents.toString().split("\n")

    // Check that routes are present
    expect(redirects).toContain("/static  /_next/pages/static.html  200")
    expect(redirects).toContain("/static/:id  /_next/pages/static/[id].html  200")
    expect(redirects).toContain("/  /.netlify/functions/nextRouter?_path=/  200")
    expect(redirects).toContain("/index  /.netlify/functions/nextRouter?_path=/index  200")
    expect(redirects).toContain("/shows/:id  /.netlify/functions/nextRouter?_path=/shows/:id  200")
    expect(redirects).toContain("/shows/*  /.netlify/functions/nextRouter?_path=/shows/*  200")
  })
})
