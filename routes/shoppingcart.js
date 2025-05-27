const express = require('express');
const router = express.Router();
const Product = require("../models/product");
const Cart = require('../models/cart');
const Order = require('../models/order');
const nodemailer = require('nodemailer');
const stripe = require('stripe')('sk_test_51RGMvyFR4X8vzQ9igwkxWsGTKQrRlmeIBQBAvDiqmxh1fv5DovI8e0JuZYNTy2snjmK6959gQu0YOrdry0GKSnPT003UoBcEuR');

// Middleware
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) return next();
    req.session.oldUrl = req.url;
    res.redirect('/user/signin');
}

function isNotAdmin(req, res, next) {
    if (!req.user.isSeller) return next();
    req.session.oldUrl = req.url;
    req.flash('error', 'Please sign in as a user to order');
    res.redirect('/admin');
}

// Add to cart
router.get('/add-to-cart/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            req.flash('error', 'Product not found');
            return res.redirect('/');
        }
        const cart = new Cart(req.session.cart || {});
        cart.add(product, product.id);
        req.session.cart = cart;
        req.flash('success', 'Added to Cart');
        res.redirect('back');
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Modify cart quantities
router.get('/reduce/:id', (req, res) => {
    const cart = new Cart(req.session.cart || {});
    cart.reduceByOne(req.params.id);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

router.get('/increase/:id', (req, res) => {
    const cart = new Cart(req.session.cart || {});
    cart.increaseByOne(req.params.id);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

router.get('/remove/:id', (req, res) => {
    const cart = new Cart(req.session.cart || {});
    cart.removeItem(req.params.id);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

// View cart
router.get('/shopping-cart', (req, res) => {
    if (!req.session.cart) {
        return res.render('shop/shopping-cart', { products: null });
    }
    const cart = new Cart(req.session.cart);
    res.render('shop/shopping-cart', {
        products: cart.generateArray(),
        totalPrice: cart.totalPrice,
        errMsg: req.flash('error')[0],
        noErrors: !req.flash('error')[0],
    });
});

// View product
router.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.redirect('/');
        res.render('shop/show', {
            product,
            successMsg: req.flash('success')[0],
            noMessages: !req.flash('success')[0],
            isIcon: req.flash('success')[0] === "Added to Cart"
        });
    } catch (err) {
        console.error(err);
        res.redirect('/');
    }
});

// Checkout
router.get('/checkout', isLoggedIn, isNotAdmin, (req, res) => {
    if (!req.session.cart) return res.redirect('/shopping-cart');
    const cart = new Cart(req.session.cart);
    const outOfStockItem = Object.values(cart.items).find(item => item.qty > item.item.qty);
    if (outOfStockItem) {
        req.flash('error', `Product '${outOfStockItem.item.title}' is out of stock.`);
        return res.redirect('/shopping-cart');
    }

    Order.find({ user: req.user })
        .sort({ purchaseDate: -1 })
        .limit(1)
        .exec((err, orders) => {
            if (err) return res.redirect('/shopping-cart');
            const previousOrderDetails = orders[0] || {};
            res.render('shop/checkout', {
                cart,
                total: cart.totalPrice,
                errMsg: req.flash('error')[0],
                noErrors: !req.flash('error')[0],
                previousOrderDetails
            });
        });
});

// POST checkout (COD)
router.post('/checkout', isLoggedIn, isNotAdmin, (req, res) => {
    if (!req.session.cart) return res.redirect('/shopping-cart');

    const { name, address, city, state, zip, Radio } = req.body;
    if (!name || !address || !city || !state || !zip) {
        req.flash('error', "Please fill out all the shipping details");
        return res.redirect('/checkout');
    }

    const cart = new Cart(req.session.cart);
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    if (Radio === 'cod') {
        createOrder(req, res, cart, date, null, "Cash");
    } else {
        res.redirect('/');
    }
});

// Stripe Checkout Session
router.post('/create-checkout-session', isLoggedIn, async (req, res) => {
    if (!req.session.cart) return res.status(400).json({ error: 'Cart is empty' });
    const cart = new Cart(req.session.cart);

      const { name, address, city, state, zip} = req.body;
    if (!name || !address || !city || !state || !zip) {
        req.flash('error', "Please fill out all the shipping details");
        return res.redirect('/checkout');
    }

    const line_items = Object.values(cart.items).map(product => ({
        price_data: {
            currency: 'inr',
            product_data: { name: product.item.title },
            unit_amount: product.item.price * 100,
        },
        quantity: product.qty,
    }));

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items,
            mode: 'payment',
            success_url: 'http://localhost:8000/checkout/success',
            cancel_url: 'http://localhost:8000/checkout/cancel',
        });
        res.json({ url: session.url });
    } catch (error) {
        console.error("Stripe Checkout Error:", error);
        res.status(500).json({ error: 'Stripe session failed' });
    }
});

// Stripe success
router.get('/checkout/success', isLoggedIn, isNotAdmin, (req, res) => {
    if (!req.session.cart) return res.redirect('/');
    const cart = new Cart(req.session.cart);
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    createOrder(req, res, cart, date, 'Stripe-Session', 'Online');
});

// Stripe cancel
router.get('/checkout/cancel', (req, res) => {
    req.flash('error', 'Payment cancelled.');
    res.redirect('/checkout');
});

// Create order
async function createOrder(req, res, cart, date, paymentId, paymentMode) {
    try {
        const order = new Order({
            user: req.user._id,
            cart,
            address: req.body?.address || "From Stripe Checkout",
            name: req.body?.name || req.user.fullname,
            city: req.body?.city || '',
            state: req.body?.state || '',
            zip: req.body?.zip || '',
            paymentId,
            paymentMode,
            purchaseDate: date,
        });

        for (const product of Object.values(cart.items)) {
            const newQty = product.item.qty - product.qty;
            const newSoldQty = (product.item.soldQty || 0) + product.qty;
            await Product.findByIdAndUpdate(product.item._id, {
                $set: { qty: newQty, soldQty: newSoldQty }
            });
        }

        await order.save();
        sendOrderConfirmationEmail(req.user.email, cart, req.user.fullname);
        req.session.cart = null;
        req.flash('success', 'Order Placed Successfully.');
        res.redirect('/');
    } catch (err) {
        console.error("Error creating order:", err);
        req.flash('error', 'Failed to save order.');
        res.redirect('/checkout');
    }
}

// Send email
function sendOrderConfirmationEmail(email, cart, fullname) {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'vigneshwaranmca22@gmail.com',
            pass: process.env.MAILPASS,
        }
    });

    const mailOptions = {
        from: 'vigneshwaranmca22@gmail.com',
        to: email,
        subject: 'MedEasy - Order Confirmation',
        html: `
            <h2>Successfully received your order, ${fullname}!</h2>
            <p>Order quantity: <b>${cart.totalQty}</b></p>
            <p>Order total: <b>₹ ${cart.totalPrice}</b></p>
            <p>You can view your order details in order history under your account.</p>
            <hr>
            <h3>Thank you for ordering with MedEasy!</h3>
            <h4>Get Well Soon !!</h4>
        `
    };

    transporter.sendMail(mailOptions, (err) => {
        if (err) console.error("Email failed:", err);
        else console.log("Order confirmation email sent!");
    });
}

module.exports = router;
