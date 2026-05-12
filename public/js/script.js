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
            editBtn.innerHTML = `<svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                <path d="M10 18.1213H19M14.5 1.62132C14.8978 1.2235 15.4374 1 16 1C16.2786 1 16.5544 1.05487 16.8118 1.16148C17.0692 1.26808 17.303 1.42434 17.5 1.62132C17.697 1.8183 17.8532 2.05216 17.9598 2.30953C18.0665 2.5669 18.1213 2.84274 18.1213 3.12132C18.1213 3.3999 18.0665 3.67574 17.9598 3.93311C17.8532 4.19048 17.697 4.42434 17.5 4.62132L5 17.1213L1 18.1213L2 14.1213L14.5 1.62132Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>`;
            editBtn.classList.add("edit__ingredient__item__button");
            editBtn.classList.add("form__button");
            editBtn.classList.add("form__button__edit");
            editBtn.classList.add("reset__button");
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
            deleteBtn.innerHTML = `<svg viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 18C2.45 18 1.97917 17.8042 1.5875 17.4125C1.19583 17.0208 1 16.55 1 16V3H0V1H5V0H11V1H16V3H15V16C15 16.55 14.8042 17.0208 14.4125 17.4125C14.0208 17.8042 13.55 18 13 18H3ZM13 3H3V16H13V3ZM5 14H7V5H5V14ZM9 14H11V5H9V14Z" fill="currentColor"/>
                </svg>`;
            deleteBtn.classList.add("form__button");
            deleteBtn.classList.add("form__button__delete");
            deleteBtn.classList.add("reset__button");
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

    const searchInput = document.querySelector("#recipe__search");

    searchInput && searchInput.addEventListener("input", applyFilters);

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
        const searchTerm = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        recipeItems.forEach((recipeItem) => {
            // search is handled independently via search__hidden
            if (searchTerm) {
                const title = (recipeItem.dataset.title || "").toLowerCase();
                const ingredients = Array.from(
                    recipeItem.querySelectorAll(".ingredient__button"),
                ).map((btn) => btn.dataset.ingredientName.toLowerCase());
                const matchesSearch =
                    title.includes(searchTerm) ||
                    ingredients.some((ing) => ing.includes(searchTerm));
                recipeItem.classList.toggle("search__hidden", !matchesSearch);
            } else {
                recipeItem.classList.remove("search__hidden");
            }

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

    // parse pasted ingredients list:
    const parseIngredientsForm = document.querySelector("#parse__ingredients__form");
    const parseIngredientsButton = document.querySelector("#parse__ingredients__button");
    const parseIngredientsStatus = document.querySelector("#parse__ingredients__status");

    parseIngredientsForm &&
        parseIngredientsForm.addEventListener("submit", async (e) => {
            e.preventDefault();
            const textarea = parseIngredientsForm.querySelector("#ingredients_text");
            const text = textarea.value.trim();
            if (!text) return;

            parseIngredientsButton.textContent = "Adding...";
            parseIngredientsButton.disabled = true;
            parseIngredientsStatus.textContent = "";

            const response = await fetch("/shopping-list/parse-ingredients", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ingredients_text: text }),
            });
            const data = await response.json();

            if (response.ok && data.items) {
                const customList = document.querySelector(".shopping__list__custom__product__ingredients .reset__ul");
                const emptyMsg = document.querySelector(".shopping__list__custom__product__ingredients h4");

                if (emptyMsg) emptyMsg.remove();

                let ul = customList;
                if (!ul) {
                    ul = document.createElement("ul");
                    ul.className = "reset__ul";
                    parseIngredientsForm.insertAdjacentElement("beforebegin", ul);
                }

                data.items.forEach((item) => {
                    const li = document.createElement("li");
                    li.className = "shopping__list__recipe__ingredients__item";
                    li.innerHTML = `
                        <form class="shopping__list__item__form" action="/shopping-list/custom-product/${item.id}?_method=PUT" method="POST">
                            <input type="text" name="custom_product" value="${item.custom_product}">
                            <button class="update__shopping__list__submit__button form__button form__button__submit reset__button" type="submit">done</button>
                            <button class="cancel__edit__ingredient__item__button form__button form__button__cancel reset__button" type="button">cancel</button>
                        </form>
                        <p class="shopping__list__recipe__ingredient__title">
                            <span>${item.custom_product}</span>
                            <button class="edit__ingredient__item__button form__button form__button__edit reset__button" title="edit item">
                                <svg viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg"><path d="M10 18.1213H19M14.5 1.62132C14.8978 1.2235 15.4374 1 16 1C16.2786 1 16.5544 1.05487 16.8118 1.16148C17.0692 1.26808 17.303 1.42434 17.5 1.62132C17.697 1.8183 17.8532 2.05216 17.9598 2.30953C18.0665 2.5669 18.1213 2.84274 18.1213 3.12132C18.1213 3.3999 18.0665 3.67574 17.9598 3.93311C17.8532 4.19048 17.697 4.42434 17.5 4.62132L5 17.1213L1 18.1213L2 14.1213L14.5 1.62132Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                            </button>
                        </p>
                        <form class="shopping__list__item__delete" action="/shopping-list/shopping-list-item/${item.id}?_method=DELETE" method="POST" onclick="return confirm('are you sure you want to delete ${item.custom_product} from your shopping list?')">
                            <button class="form__button form__button__delete reset__button" type="submit">
                                <svg viewBox="0 0 16 18" xmlns="http://www.w3.org/2000/svg"><path d="M3 18C2.45 18 1.97917 17.8042 1.5875 17.4125C1.19583 17.0208 1 16.55 1 16V3H0V1H5V0H11V1H16V3H15V16C15 16.55 14.8042 17.0208 14.4125 17.4125C14.0208 17.8042 13.55 18 13 18H3ZM13 3H3V16H13V3ZM5 14H7V5H5V14ZM9 14H11V5H9V14Z" fill="currentColor"/></svg>
                            </button>
                        </form>`;

                    // wire up edit/cancel buttons on the new item
                    li.querySelector(".edit__ingredient__item__button").addEventListener("click", function () {
                        li.classList.add("active");
                    });
                    li.querySelector(".cancel__edit__ingredient__item__button").addEventListener("click", function () {
                        li.classList.remove("active");
                    });

                    ul.appendChild(li);
                });

                textarea.value = "";
                parseIngredientsStatus.textContent = `${data.items.length} item(s) added.`;
            } else {
                parseIngredientsStatus.textContent = data.error || "Something went wrong.";
            }

            parseIngredientsButton.textContent = "Add items";
            parseIngredientsButton.disabled = false;
        });

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
