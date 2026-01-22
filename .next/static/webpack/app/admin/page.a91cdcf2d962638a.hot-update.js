"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
self["webpackHotUpdate_N_E"]("app/admin/page",{

/***/ "(app-pages-browser)/./app/admin/actions.ts":
/*!******************************!*\
  !*** ./app/admin/actions.ts ***!
  \******************************/
/***/ (function(module, __webpack_exports__, __webpack_require__) {

__webpack_require__.r(__webpack_exports__);
/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   changeUserPassword: function() { return /* binding */ changeUserPassword; },
/* harmony export */   createAccount: function() { return /* binding */ createAccount; },
/* harmony export */   deleteAccount: function() { return /* binding */ deleteAccount; },
/* harmony export */   getAllUsers: function() { return /* binding */ getAllUsers; },
/* harmony export */   getClientStats: function() { return /* binding */ getClientStats; },
/* harmony export */   getClients: function() { return /* binding */ getClients; },
/* harmony export */   getCurrentUser: function() { return /* binding */ getCurrentUser; },
/* harmony export */   getMonthlyRevenue: function() { return /* binding */ getMonthlyRevenue; },
/* harmony export */   sendPasswordReset: function() { return /* binding */ sendPasswordReset; },
/* harmony export */   updateClient: function() { return /* binding */ updateClient; },
/* harmony export */   updateUser: function() { return /* binding */ updateUser; }
/* harmony export */ });
/* harmony import */ var next_dist_client_app_call_server__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/client/app-call-server */ "(app-pages-browser)/./node_modules/next/dist/client/app-call-server.js");
/* harmony import */ var next_dist_client_app_call_server__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_client_app_call_server__WEBPACK_IMPORTED_MODULE_0__);
/* harmony import */ var private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! private-next-rsc-action-client-wrapper */ "(app-pages-browser)/./node_modules/next/dist/build/webpack/loaders/next-flight-loader/action-client-wrapper.js");



function __build_action__(action, args) {
  return (0,next_dist_client_app_call_server__WEBPACK_IMPORTED_MODULE_0__.callServer)(action.$$id, args)
}

/* __next_internal_action_entry_do_not_use__ {"296e4d65a8706ea53bab144c85223d1356df113e":"createAccount","31abed57123ff551c2c63b89c240838a521c8470":"updateClient","5ad6bca637575b59628c4a7e37b622dcef8699b4":"getMonthlyRevenue","5c9dce52b6020d6a83fcb09f03edd0e4d6fdb37f":"getClientStats","6e45d93cd9e029553fc95108a0374c4ed160e47d":"changeUserPassword","7c1f54597027211d513222750409ed04da55a029":"updateUser","c7d7446b91628a6af229767dac4d25919b9591c4":"getCurrentUser","cbff0144b78e992679fc0b836709e9aea3a29eff":"sendPasswordReset","ce77ea285d6a0253072e0c7eb2427ca781b1895c":"getAllUsers","f25ff66051d9325dd10ec23f6ff401c6d4f0a051":"deleteAccount","f8c91c3a37db2e06c9e89f30afca2658f92a85a5":"getClients"} */ var getCurrentUser = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("c7d7446b91628a6af229767dac4d25919b9591c4");

var getClients = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("f8c91c3a37db2e06c9e89f30afca2658f92a85a5");
var updateClient = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("31abed57123ff551c2c63b89c240838a521c8470");
var getClientStats = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("5c9dce52b6020d6a83fcb09f03edd0e4d6fdb37f");
var getMonthlyRevenue = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("5ad6bca637575b59628c4a7e37b622dcef8699b4");
var getAllUsers = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("ce77ea285d6a0253072e0c7eb2427ca781b1895c");
var updateUser = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("7c1f54597027211d513222750409ed04da55a029");
var sendPasswordReset = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("cbff0144b78e992679fc0b836709e9aea3a29eff");
var createAccount = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("296e4d65a8706ea53bab144c85223d1356df113e");
var deleteAccount = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("f25ff66051d9325dd10ec23f6ff401c6d4f0a051");
var changeUserPassword = (0,private_next_rsc_action_client_wrapper__WEBPACK_IMPORTED_MODULE_1__.createServerReference)("6e45d93cd9e029553fc95108a0374c4ed160e47d");



;
    // Wrapped in an IIFE to avoid polluting the global scope
    ;
    (function () {
        var _a, _b;
        // Legacy CSS implementations will `eval` browser code in a Node.js context
        // to extract CSS. For backwards compatibility, we need to check we're in a
        // browser context before continuing.
        if (typeof self !== 'undefined' &&
            // AMP / No-JS mode does not inject these helpers:
            '$RefreshHelpers$' in self) {
            // @ts-ignore __webpack_module__ is global
            var currentExports = module.exports;
            // @ts-ignore __webpack_module__ is global
            var prevSignature = (_b = (_a = module.hot.data) === null || _a === void 0 ? void 0 : _a.prevSignature) !== null && _b !== void 0 ? _b : null;
            // This cannot happen in MainTemplate because the exports mismatch between
            // templating and execution.
            self.$RefreshHelpers$.registerExportsForReactRefresh(currentExports, module.id);
            // A module can be accepted automatically based on its exports, e.g. when
            // it is a Refresh Boundary.
            if (self.$RefreshHelpers$.isReactRefreshBoundary(currentExports)) {
                // Save the previous exports signature on update so we can compare the boundary
                // signatures. We avoid saving exports themselves since it causes memory leaks (https://github.com/vercel/next.js/pull/53797)
                module.hot.dispose(function (data) {
                    data.prevSignature =
                        self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports);
                });
                // Unconditionally accept an update to this module, we'll check if it's
                // still a Refresh Boundary later.
                // @ts-ignore importMeta is replaced in the loader
                module.hot.accept();
                // This field is set when the previous version of this module was a
                // Refresh Boundary, letting us know we need to check for invalidation or
                // enqueue an update.
                if (prevSignature !== null) {
                    // A boundary can become ineligible if its exports are incompatible
                    // with the previous exports.
                    //
                    // For example, if you add/remove/change exports, we'll want to
                    // re-execute the importing modules, and force those components to
                    // re-render. Similarly, if you convert a class component to a
                    // function, we want to invalidate the boundary.
                    if (self.$RefreshHelpers$.shouldInvalidateReactRefreshBoundary(prevSignature, self.$RefreshHelpers$.getRefreshBoundarySignature(currentExports))) {
                        module.hot.invalidate();
                    }
                    else {
                        self.$RefreshHelpers$.scheduleUpdate();
                    }
                }
            }
            else {
                // Since we just executed the code for the module, it's possible that the
                // new exports made it ineligible for being a boundary.
                // We only care about the case when we were _previously_ a boundary,
                // because we already accepted this update (accidental side effect).
                var isNoLongerABoundary = prevSignature !== null;
                if (isNoLongerABoundary) {
                    module.hot.invalidate();
                }
            }
        }
    })();


/***/ })

});