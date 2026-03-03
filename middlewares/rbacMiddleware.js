/**
 * RBAC Middleware
 * Enforces permissions for Admin and ChildAdmin roles.
 */

exports.checkPermission = (requiredPermission) => {
    return (req, res, next) => {
        try {
            const { role, grantedPermissions } = req;

            // 1. Super Admin has all permissions
            if (role === 'Admin') {
                return next();
            }

            // 2. Child Admin must have the specific permission
            if (role === 'Child_Admin') {
                if (!grantedPermissions) {
                    return res.status(403).json({ success: false, message: 'No permissions granted to this account' });
                }

                // Check if the specific permission is granted
                // Also supports 'ALL' if we ever want to grant a child admin full access
                if (grantedPermissions.includes(requiredPermission) || grantedPermissions.includes('ALL')) {
                    return next();
                }

                return res.status(403).json({
                    success: false,
                    message: `Access denied. You do not have permission to ${requiredPermission.replace(/([A-Z])/g, ' $1').toLowerCase()}.`
                });
            }

            // 3. Any other role (or missing role) is denied
            return res.status(403).json({ success: false, message: 'Access denied. Unauthorized role.' });
        } catch (error) {
            console.error('RBAC Middleware Error:', error);
            return res.status(500).json({ success: false, message: 'Internal server error during permission check' });
        }
    };
};
