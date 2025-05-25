var express = require('express');
var router = express.Router();
var Product = require("../models/product");
var Cart = require('../models/cart');
var Order = require('../models/order');
var ObjectId = require('mongoose').Types.ObjectId;
const nodemailer = require('nodemailer');

router.get('/add-to-cart/:id', function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});

    Product.findById(productId, function (err, product) {
        if (err) {
            return res.redirect('/');
        }
        cart.add(product, product.id);
        req.session.cart = cart;
        req.flash('success', 'Added to Cart');
        res.redirect("back");
    });
});

router.get('/reduce/:id', function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});
    cart.reduceByOne(productId);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

router.get('/increase/:id', function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});
    cart.increaseByOne(productId);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

router.get('/remove/:id', function (req, res) {
    var productId = req.params.id;
    var cart = new Cart(req.session.cart ? req.session.cart : {});
    cart.removeItem(productId);
    req.session.cart = cart;
    res.redirect('/shopping-cart');
});

router.get('/shopping-cart', function (req, res) {
    var errMsg = req.flash('error')[0];
    if (!req.session.cart) {
        return res.render('shop/shopping-cart', { products: null });
    }
    var cart = new Cart(req.session.cart);
    res.render('shop/shopping-cart', {
        products: cart.generateArray(),
        totalPrice: cart.totalPrice,
        errMsg: errMsg,
        noErrors: !errMsg
    });
});

router.get('/products/:id', function (req, res) {
    var successMsg = req.flash('success')[0];
    var isIcon = successMsg === "Added to Cart";
    var productId = req.params.id;

    Product.findById(productId, function (err, foundProduct) {
        if (err) {
            console.log("Error fetching product:", err);
            return res.redirect('/');
        }
        res.render('shop/show', {
            product: foundProduct,
            successMsg: successMsg,
            noMessages: !successMsg,
            isIcon: isIcon
        });
    });
});

router.get('/checkout', isLoggedIn, isNotAdmin, function (req, res) {
    var errMsg = req.flash('error')[0];
    if (!req.session.cart) {
        return res.redirect('/shopping-cart');
    }
    var cart = new Cart(req.session.cart);
    var cartItems = Object.values(cart.items);
    var outOfStockItem = cartItems.find(item => item.qty > item.item.qty);

    if (outOfStockItem) {
        req.flash('error', `Product - '${outOfStockItem.item.title}' is out of stock. Please decrease its quantity.`);
        return res.redirect('/shopping-cart');
    }

    Order.find({ user: req.user }, function (err, result) {
        var previousOrderDetails = result.length > 0 ? result.sort((a, b) => new Date(b.purchaseDate) - new Date(a.purchaseDate))[0] : {};
        res.render('shop/checkout', {
            cart: cart,
            total: cart.totalPrice,
            errMsg: errMsg,
            noErrors: !errMsg,
            previousOrderDetails: previousOrderDetails
        });
    });
});

router.post('/checkout', isLoggedIn, isNotAdmin, function (req, res) {
    if (!req.session.cart) {
        return res.redirect('/shopping-cart');
    }
    var cart = new Cart(req.session.cart);

    const { name, address, city, state, zip, Radio } = req.body;
    if (!name || !address || !city || !state || !zip) {
        req.flash('error', "Please fill out all the shipping details");
        return res.redirect('/checkout');
    }

    var date = new Date();
    date.setHours(0, 0, 0, 0);

    if (Radio === 'online') {
        var stripe = require('stripe')('sk_test_51RGMvyFR4X8vzQ9igwkxWsGTKQrRlmeIBQBAvDiqmxh1fv5DovI8e0JuZYNTy2snjmK6959gQu0YOrdry0GKSnPT003UoBcEuR');
console.log("we are inside shoppingcart")
        stripe.charges.create({
            amount: cart.totalPrice * 100,
            currency: 'inr',
            source: req.body.stripeToken,
            description: 'MedEasy',
        }, function (err, charge) {
            if (err) {
                req.flash('error', err.message);
                return res.redirect('/checkout');
            }
            createOrder(req, res, cart, date, charge.id, "Online");
        });

    } else if (Radio === 'b') { // Cash on Delivery
        createOrder(req, res, cart, date, null, "Cash");
    } else {
        res.redirect('/');
    }
});

function createOrder(req, res, cart, date, paymentId, paymentMode) {
    var order = new Order({
        user: req.user,
        cart: cart,
        address: req.body.address,
        name: req.body.name,
        paymentId: paymentId,
        paymentMode: paymentMode,
        purchaseDate: date,
        city: req.body.city,
        state: req.body.state,
        zip: req.body.zip
    });

    Object.values(cart.items).forEach(function (product) {
        let prevQty = product.item.qty;
        let newQty = prevQty - product.qty;
        let newSoldQty = (product.item.soldQty || 0) + product.qty;

        Product.findOneAndUpdate(
            { _id: ObjectId(product.item._id) },
            { $set: { qty: newQty, soldQty: newSoldQty } },
            function (err) {
                if (err) {
                    console.log("Error updating product qty:", err);
                }
            }
        );
    });

    sendOrderConfirmationEmail(req.user.email, cart, req.user.fullname);

    order.save(function (err) {
        if (err) {
            console.log("Error saving order:", err);
            return res.redirect('/checkout');
        }
        req.flash('success', 'Order Placed Successfully.');
        req.session.cart = null;
        res.redirect('/');
    });
}

function sendOrderConfirmationEmail(email, cart, fullname) {
    let transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'vigneshwaranmca22@gmail.com',
            pass: process.env.MAILPASS
        }
    });

    let mailOptions = {
        from: 'vigneshwaranmca22@gmail.com',
        to: email,
        subject: 'MedEasy - Order Confirmation',
        html: `<h2>Successfully received your order, ${fullname}!</h2>
               <p>Order quantity: <b>${cart.totalQty}</b></p>
               <p>Order total: <b>₹ ${cart.totalPrice}</b></p>
               <p>You can view your order details in order history under your account.</p>
               <hr>
               <h3>Thank you for ordering with MedEasy!</h3>
               <h4>Get Well Soon !!</h4>`
    };

    transporter.sendMail(mailOptions, function (err) {
        if (err) {
            console.log("Failed to send email:", err);
        } else {
            console.log("Order confirmation email sent!");
        }
    });
}

// MIDDLEWARE
function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    req.session.oldUrl = req.url;
    res.redirect('/user/signin');
}

function isNotAdmin(req, res, next) {
    if (!req.user.isSeller) {
        return next();
    }
    req.session.oldUrl = req.url;
    req.flash('error', 'Please sign in as a user to order');
    res.redirect('/admin');
}

module.exports = router;
