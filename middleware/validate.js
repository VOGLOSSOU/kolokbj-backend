// Valide (et normalise) req.body ou req.query avec un schéma Zod ;
// une ZodError part dans errorHandler
function validate(schema, source = 'body') {
  return (req, res, next) => {
    const parsed = schema.parse(req[source] ?? {});
    // Express 5 : req.query est un getter en lecture seule, on le masque
    Object.defineProperty(req, source, {
      value: parsed,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
}

module.exports = validate;
