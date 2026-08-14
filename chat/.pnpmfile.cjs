/**
 * PptxGenJS 4.0.1 declares image-size as a Node-only dependency, but its
 * browser bundle marks that module as unavailable and does not import it.
 * image-size currently has unresolved parser DoS advisories. The chat client
 * only uses the browser bundle, so exclude that unreachable dependency from
 * the installed production graph until PptxGenJS publishes an upstream fix.
 */
module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'pptxgenjs' && pkg.version === '4.0.1' && pkg.dependencies) {
        delete pkg.dependencies['image-size'];
      }
      return pkg;
    },
  },
};
