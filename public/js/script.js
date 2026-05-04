import { initAllUpdateForms } from "./updateRecipeForm.js";

document.addEventListener("DOMContentLoaded", scripts);

function scripts() {
    // ==================
    // INGREDIENTS
    // ==================
    const ingredientList = document.querySelector("#ingredient__list");
    const ingredientFormValues = document.querySelector(
        "#ingredient__form__values",
    );
    const ingredientNameInput = document.querySelector(
        "#ingredient_name_input",
    );
    const ingredientQuantityInput = document.querySelector(
        "#ingredient_quantity_input",
    );
    const ingredientUnitInput = document.querySelector(
        "#ingredient_unit_input",
    );

    let ingredients = [];

    function syncIngredientHiddenForm() {
        if (!ingredientFormValues) return;
        ingredientFormValues.innerHTML = "";
        ingredients.forEach(({ name, quantity, unit }) => {
            const fields = {
                ingredient_name: name,
                ingredient_quantity: quantity,
                ingredient_unit: unit,
            };
            Object.entries(fields).forEach(([fieldName, val]) => {
                const input = document.createElement("input");
                input.type = "hidden";
                input.name = fieldName;
                input.value = val;
                ingredientFormValues.appendChild(input);
            });
        });
    }

    function renderIngredients() {
        if (!ingredientList) return;
        ingredientList.innerHTML = "";

        if (ingredients.length === 0) {
            const emptyMsg = document.createElement("li");
            emptyMsg.textContent = "No ingredients added yet";
            emptyMsg.classList.add("no__items__ingredient");
            ingredientList.appendChild(emptyMsg);
            syncIngredientHiddenForm();
            return;
        }

        ingredients.forEach(({ name, quantity, unit }, index) => {
            const li = document.createElement("li");
            li.classList.add("ingredient__list__item");

            const label = document.createElement("span");
            label.classList.add("ingredient__list__label");
            label.textContent = `${name} — ${quantity} ${unit}`;

            const editBtn = document.createElement("button");
            editBtn.type = "button";
            editBtn.textContent = "Edit";
            editBtn.classList.add("ingredient__edit__button");
            editBtn.addEventListener("click", () => {
                if (ingredientNameInput) ingredientNameInput.value = name;
                if (ingredientQuantityInput)
                    ingredientQuantityInput.value = quantity;
                if (ingredientUnitInput) ingredientUnitInput.value = unit;
                ingredients.splice(index, 1);
                renderIngredients();
                ingredientNameInput?.focus();
            });

            const deleteBtn = document.createElement("button");
            deleteBtn.type = "button";
            deleteBtn.textContent = "Delete";
            deleteBtn.classList.add("ingredient__delete__button");
            deleteBtn.addEventListener("click", () => {
                ingredients.splice(index, 1);
                renderIngredients();
            });

            li.appendChild(label);
            li.appendChild(editBtn);
            li.appendChild(deleteBtn);
            ingredientList.appendChild(li);
        });

        syncIngredientHiddenForm();
    }

    // initialise from server-rendered data attributes (update form only)
    if (ingredientList) {
        Array.from(
            ingredientList.querySelectorAll(".ingredient__list__item"),
        ).forEach((item) => {
            if (item.dataset.name) {
                ingredients.push({
                    name: item.dataset.name,
                    quantity: item.dataset.quantity,
                    unit: item.dataset.unit,
                });
            }
        });
        renderIngredients();
    }

    const addIngredientButton = document.querySelector(
        "#add__ingredient__button",
    );
    addIngredientButton &&
        addIngredientButton.addEventListener("click", () => {
            const name = ingredientNameInput?.value.trim().toLowerCase();
            const quantity = ingredientQuantityInput?.value.trim();
            const unit = ingredientUnitInput?.value.trim();

            if (!name) return;

            ingredients.push({ name, quantity, unit });
            renderIngredients();

            if (ingredientNameInput) ingredientNameInput.value = "";
            if (ingredientQuantityInput) ingredientQuantityInput.value = "";
            if (ingredientUnitInput) ingredientUnitInput.value = "";
            ingredientNameInput?.focus();
        });

    // ==================
    // COLLECTIONS / TAGS
    // ==================
    const recipeSelectedTagList = document.querySelector(
        "#selected__tag__list",
    );
    const collectionFormValues = document.querySelector(
        "#collection__form__values",
    );
    let noTagsAlertItem;
    if (recipeSelectedTagList && recipeSelectedTagList.children.length < 1) {
        noTagsAlertItem = document.createElement("li");
        noTagsAlertItem.classList.add("no__items__tag");
        noTagsAlertItem.classList.add("visible");
        noTagsAlertItem.innerText =
            "no collections associated with this recipe yet";
        recipeSelectedTagList.appendChild(noTagsAlertItem);
    }

    const addNewCollectionButton = document.querySelector(
        "#add__collection__button",
    );

    function removeTagFromUser(tagParent) {
        tagParent.remove();
    }
    function removeCollectionFromHiddenForm(tagValue) {
        const formValues = collectionFormValues?.querySelectorAll("input");
        // console.log(formValues);

        formValues.forEach((formValue) => {
            if (formValue.value == tagValue) {
                // console.log(formValue);
                formValue.remove();
            }
        });
    }

    const showTagToUser = (value) => {
        const selectedTagListItem = document.createElement("li");
        selectedTagListItem.classList.add("selected__tag__item");

        const block = document.createElement("div");
        block.classList.add("selected__tag__item__block");
        block.classList.add("tag__item");
        block.dataset.valueTitle = value;
        block.textContent = value;

        const tagRemoveButton = document.createElement("div");
        tagRemoveButton.classList.add("tag__remove__button");
        tagRemoveButton.innerHTML = `<span>❌</span>`;
        tagRemoveButton.addEventListener("click", function () {
            removeTagFromUser(selectedTagListItem);
            removeCollectionFromHiddenForm(value);
        });

        block.appendChild(tagRemoveButton);
        selectedTagListItem.appendChild(block);
        recipeSelectedTagList.appendChild(selectedTagListItem);
        noTagsAlertItem.classList.remove("visible");
    };

    // HIDDEN FORM TAG VALUES
    const addTagToForm = (value) => {
        const newHiddenCollectionInput = document.createElement("input");
        newHiddenCollectionInput.name = "tags[]";
        newHiddenCollectionInput.type = "hidden";
        newHiddenCollectionInput.value = value;
        collectionFormValues.appendChild(newHiddenCollectionInput);
    };

    function checkTagExists(value) {
        let tagItemValues = [];
        recipeSelectedTagList
            ?.querySelectorAll(".selected__tag__item__block")
            .forEach((tag) => {
                // console.log(tag);
                tagItemValues.push(tag.dataset.valueTitle);
            });
        if (tagItemValues.length < 1 || !tagItemValues.includes(value)) {
            return true;
        }
    }

    const processNewTag = (value) => {
        const tagExists = checkTagExists(value);
        if (tagExists) {
            addTagToForm(value);
            showTagToUser(value);
        }
    };

    // new collection from form input
    addNewCollectionButton &&
        addNewCollectionButton.addEventListener("click", function () {
            const collectionInput =
                document.querySelector("#collection__input");
            const collectionInputValue = collectionInput.value;
            processNewTag(collectionInputValue);

            collectionInput.value = "";
        });

    // new collection from existing tags
    const existingTaglist = document.querySelector(
        ".existing__collection__list",
    );
    const existingTagsArray = existingTaglist?.querySelectorAll(
        ".existing__collection__item__button",
    );
    console.log(existingTaglist);
    console.log(existingTagsArray);

    existingTagsArray &&
        existingTagsArray.forEach((tag) => {
            tag.addEventListener("click", function () {
                const existingTagTitle = tag.dataset.tagTitle;
                processNewTag(existingTagTitle);
            });
        });

    // GET ANY EXISTING TAGS IN RECIPE DB INSTANCE
    recipeSelectedTagList
        ?.querySelectorAll(".selected__tag__item")
        .forEach((item) => {
            const block = item.querySelector(".selected__tag__item__block");
            if (block) {
                addTagToForm(block.dataset.valueTitle);
            }
        });

    recipeSelectedTagList
        ?.querySelectorAll(".selected__tag__item")
        .forEach((item) => {
            const block = item.querySelector(".selected__tag__item__block");
            const removeBtn = item.querySelector(".tag__remove__button");
            if (removeBtn && block) {
                removeBtn.addEventListener("click", function () {
                    removeTagFromUser(item);
                    removeCollectionFromHiddenForm(block.dataset.valueTitle);
                });
            }
        });

    // ADD RECIPE POPOUT
    const openAddRecipeButton = document.querySelector(
        ".open__add__recipe__popout__button ",
    );
    const addRecipePopout = document.querySelector(".new__recipe__popout");
    const closeAddRecipeButton = document.querySelector(
        ".close__add__recipe__popout__button ",
    );

    openAddRecipeButton &&
        openAddRecipeButton.addEventListener("click", function () {
            addRecipePopout.classList.add("open");
        });
    closeAddRecipeButton &&
        closeAddRecipeButton.addEventListener("click", function () {
            addRecipePopout.classList.remove("open");
        });

    // RECIPE FAVORITES
    const recipe__favorite__button = document.querySelectorAll(
        ".recipe__item__favorite__icon",
    );
    recipe__favorite__button.forEach((favoriteIcon) => {
        if (favoriteIcon.classList.contains("active")) {
            favoriteIcon
                .closest("li")
                .setAttribute("data-favorite-recipe", true);
        }

        favoriteIcon.addEventListener("click", async function (e) {
            favoriteIcon.classList.toggle("active");
            const recipeId = favoriteIcon.dataset.recipeId;
            const recipeIsFavorite = favoriteIcon.classList.contains("active");

            if (favoriteIcon.classList.contains("active")) {
                favoriteIcon
                    .closest("li")
                    .setAttribute("data-favorite-recipe", true);
            } else {
                favoriteIcon
                    .closest("li")
                    .removeAttribute("data-favorite-recipe", true);
            }

            await fetch(`/recipes/${recipeId}/favorite`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ favorite: recipeIsFavorite }),
            });
        });
    });

    // RECIPES FILTER

    const filterList = document.querySelector(
        ".recipe__collection__filter__list",
    );
    const allCollections = document.querySelectorAll(
        ".single__recipe__collection__item",
    );

    const allCollectionNames = new Set(
        Array.from(allCollections).map(
            (collection) => collection.dataset.tagName,
        ),
    );

    allCollectionNames &&
        allCollectionNames.forEach((collectionName) => {
            const filterItem = document.createElement("li");
            filterItem.classList.add("recipe__collection__filter__item");

            const filterButton = document.createElement("button");
            filterButton.setAttribute("type", "button");
            filterButton.classList.add("filter__button");
            filterButton.classList.add("tag__item");

            filterButton.innerText = collectionName;
            filterButton.dataset.filterName = collectionName;

            filterButton.addEventListener("click", function () {
                filterButton.classList.toggle("active");
                applyFilters();
            });

            filterItem.appendChild(filterButton);
            filterList.appendChild(filterItem);
        });

    const favoriteFilterButton = document.querySelector(
        ".filter__button__favorite",
    );

    favoriteFilterButton &&
        favoriteFilterButton.addEventListener("click", function () {
            favoriteFilterButton.classList.toggle("active");
            applyFilters();
        });

    function applyFilters() {
        const recipeItems = document.querySelectorAll(".recipe__item");
        const activeTagFilters = Array.from(
            document.querySelectorAll(
                ".filter__button:not(.filter__button__favorite).active",
            ),
        ).map((btn) => btn.dataset.filterName);
        const favFilterActive =
            favoriteFilterButton &&
            favoriteFilterButton.classList.contains("active");

        recipeItems.forEach((recipeItem) => {
            if (activeTagFilters.length === 0 && !favFilterActive) {
                recipeItem.classList.remove("filtered");
                return;
            }

            let matchesTags = true;
            if (activeTagFilters.length > 0) {
                const recipeTagNames = Array.from(
                    recipeItem.querySelectorAll(
                        ".single__recipe__collection__item",
                    ),
                ).map((tag) => tag.dataset.tagName);
                matchesTags = activeTagFilters.some((filter) =>
                    recipeTagNames.includes(filter),
                );
            }

            const matchesFav =
                !favFilterActive ||
                recipeItem.dataset.favoriteRecipe === "true";

            recipeItem.classList.toggle("filtered", matchesTags && matchesFav);
        });
    }

    // toggle recipe list layout
    // const toggleLayoutButton = document.querySelector(
    //     ".layout__toggle__button",
    // );

    // if (toggleLayoutButton) {
    //     const recipeList = document.querySelector(".recipe__list");
    //     const layouts = ["layout__1", "layout__2", "layout__3"];

    //     toggleLayoutButton.addEventListener("click", function () {
    //         const current = layouts.findIndex((l) =>
    //             recipeList.classList.contains(l),
    //         );
    //         const next = (current + 1) % layouts.length;
    //         layouts.forEach((l) => recipeList.classList.remove(l));
    //         recipeList.classList.add(layouts[next]);
    //     });
    // }

    // ==== ADD RECIPE & INGREDIENTS TO SHOPPING LIST ==== //

    // open / close popup -- styling
    const addIngredientsPopupOpenButtons = document.querySelectorAll(
        ".add__to__cook__list__button",
    );
    const closeIngredientsPopup = document.querySelectorAll(
        ".close__ingredients__popup",
    );

    addIngredientsPopupOpenButtons &&
        addIngredientsPopupOpenButtons.forEach((recipePopButton) => {
            recipePopButton.addEventListener("click", function (event) {
                event.target.closest("li").classList.toggle("active");
            });
        });
    closeIngredientsPopup &&
        closeIngredientsPopup.forEach((recipePopButton) => {
            recipePopButton.addEventListener("click", function (event) {
                event.target.closest("li").classList.toggle("active");
            });
        });

    // select / unselect items
    const ingredientItems = document.querySelectorAll(".ingredient__button");

    let hiddenIngredientsForm;

    const addIngredientToForm = (value) => {
        const newHiddenIngredientInput = document.createElement("input");
        newHiddenIngredientInput.name = "ingredients[]";
        newHiddenIngredientInput.type = "hidden";
        newHiddenIngredientInput.value = value;
        hiddenIngredientsForm.appendChild(newHiddenIngredientInput);
    };

    ingredientItems &&
        ingredientItems.forEach((item) => {
            item.addEventListener("click", function () {
                hiddenIngredientsForm = item
                    .closest(".ingredients__popout")
                    .querySelector(".hidden__ingredients__inputs__container");

                if (item.classList.contains("selected")) {
                    Array.from(
                        hiddenIngredientsForm.getElementsByTagName("input"),
                    ).map((hiddenImputValue) => {
                        if (
                            hiddenImputValue.value ==
                            item.dataset.ingredientName
                        ) {
                            hiddenImputValue.remove();
                        }
                    });
                    item.classList.toggle("selected");
                } else {
                    addIngredientToForm(item.dataset.ingredientName);
                    item.classList.toggle("selected");
                }
            });
        });

    // AI functionality:

    // get shopping list by aisles:
    const organiseButton = document.querySelector("#organise__list__button");

    organiseButton &&
        organiseButton.addEventListener("click", async () => {
            organiseButton.textContent = "Organising...";
            organiseButton.disabled = true;

            const response = await fetch("/shopping-list/organise", {
                method: "POST",
            });
            const data = await response.json();

            if (response.ok) {
                window.location.href = "/generated-shopping-list";
            } else {
                console.error("Something went wrong", data);
                document.querySelector("#organised__list__output").innerText =
                    data.error || "Something went wrong";
                organiseButton.textContent = "Organise by aisle";
                organiseButton.disabled = false;
            }
        });

    const checkboxes = document.querySelectorAll(".is__collected__checkbox");

    if (checkboxes.length > 0) {
        checkboxes.forEach((checkbox) => {
            checkbox.addEventListener("change", async () => {
                const itemId = checkbox.dataset.itemId;
                await fetch(`/generated-shopping-list/item/${itemId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ is_collected: checkbox.checked }),
                });
                const deleteItemButton = checkbox.nextElementSibling;
                deleteItemButton.classList.toggle("visible");
            });
        });
    }

    const generatedLists = document.querySelector(".generated__lists");
    if (generatedLists) {
        generatedLists.addEventListener("click", async function (e) {
            const shoppingItemDelete = e.target.closest(
                ".generated__item__delete__button",
            );
            if (!shoppingItemDelete) return;
            const productId = shoppingItemDelete.dataset.productId;
            const productName = shoppingItemDelete.dataset.productName;
            shoppingItemDelete.closest(".aisle__product__list__item").remove();
            fetch(`/generated-shopping-list/item/${productId}`, {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ productId, productName }),
            });
        });
    }

    // ==================
    // UPDATE RECIPE FORMS (inline popout)
    // ==================
    initAllUpdateForms();

    // SHOPPING LIST PAGE

    // SHOW / HIDE MENU
    const openMenuButton = document.querySelector(".open__menu__button");
    const shoppingListMenu = document.querySelector(".shopping__list__menu");

    openMenuButton &&
        openMenuButton.addEventListener("click", function () {
            shoppingListMenu.classList.toggle("visible");
        });

    // EDIT RECIPE INGREDIENT ITEM
    const editIngredientButton = document.querySelectorAll(
        ".edit__ingredient__item__button",
    );

    editIngredientButton.forEach((button) => {
        button.addEventListener("click", function () {
            button
                .closest(".shopping__list__recipe__ingredients__item")
                .classList.add("active");
        });
    });

    const cancelEditIngredient = document.querySelectorAll(
        ".cancel__edit__ingredient__item__button",
    );

    cancelEditIngredient.forEach((button) => {
        button.addEventListener("click", function () {
            button
                .closest(".shopping__list__recipe__ingredients__item")
                .classList.remove("active");
        });
    });
}
