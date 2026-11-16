const express = require('express');
const usersController = require('./users.controller');
const { authenticate } = require('../../middlewares/auth.middleware');
const { requireRoles } = require('../../middlewares/rbac.middleware');

const router = express.Router();

// Strict RBAC: All user management endpoints require ADMIN role
router.use(authenticate, requireRoles('ADMIN'));

router.get('/roles', (req, res, next) => usersController.getAllRoles(req, res, next));
router.get('/', (req, res, next) => usersController.getAllUsers(req, res, next));
router.post('/', (req, res, next) => usersController.createUser(req, res, next));
router.get('/:id', (req, res, next) => usersController.getUserById(req, res, next));
router.put('/:id', (req, res, next) => usersController.updateUser(req, res, next));
router.delete('/:id', (req, res, next) => usersController.deleteUser(req, res, next));

module.exports = router;
