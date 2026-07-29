const EMPTY_MODULE = 'data:text/javascript,export default undefined';

const resolve = (specifier, context, nextResolve) => {
	if (specifier.endsWith('.css')) {
		return {
			shortCircuit: true,
			url: EMPTY_MODULE,
		};
	}

	return nextResolve(specifier, context);
};

export { resolve };
