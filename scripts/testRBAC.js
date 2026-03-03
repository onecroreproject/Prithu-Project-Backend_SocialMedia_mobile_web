/**
 * RBAC Verification Script
 * This script simulates the RBAC middleware behavior for different roles and permissions.
 */

const { checkPermission } = require('../middlewares/rbacMiddleware');

// Mock Request/Response/Next
const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.body = data;
        return res;
    };
    return res;
};

const mockNext = () => {
    return () => {
        console.log('  ✅ Access Granted (next() called)');
        return true;
    };
};

function runTest(testName, role, grantedPermissions, requiredPermission, expectedStatus) {
    console.log(`\nTest: ${testName}`);
    console.log(`  Role: ${role}, Permissions: [${grantedPermissions}], Required: ${requiredPermission}`);

    const req = { role, grantedPermissions };
    const res = mockRes();
    const next = mockNext();

    const middleware = checkPermission(requiredPermission);
    const result = middleware(req, res, next);

    if (result !== true) {
        console.log(`  ❌ Access Denied (${res.statusCode}): ${res.body.message}`);
        if (res.statusCode !== expectedStatus) {
            console.error(`  FAILURE: Expected status ${expectedStatus}, got ${res.statusCode}`);
        }
    } else {
        if (expectedStatus !== 200) {
            console.error(`  FAILURE: Expected rejection, but access was granted.`);
        }
    }
}

// 1. Super Admin
runTest('Super Admin Access', 'Admin', [], 'canManageUsers', 200);

// 2. Child Admin with permission
runTest('Child Admin Success', 'Child_Admin', ['canManageFeeds', 'canManageUsers'], 'canManageUsers', 200);

// 3. Child Admin with ALL permission
runTest('Child Admin ALL Success', 'Child_Admin', ['ALL'], 'canManageReport', 200);

// 4. Child Admin missing permission
runTest('Child Admin Failure', 'Child_Admin', ['canManageFeeds'], 'canManageUsers', 403);

// 5. Unauthorized Role
runTest('Unauthorized Role', 'Guest', [], 'canManageUsers', 403);

// 6. Missing permissions array
runTest('Missing Permissions', 'Child_Admin', null, 'canManageUsers', 403);

console.log('\n--- RBAC Tests Completed ---');
