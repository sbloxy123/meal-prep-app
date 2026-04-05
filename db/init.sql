--
-- PostgreSQL database dump
--

\restrict H8seB7Pkw77psE54ZoaZ8BVz8LvIaJj5IO34RHXX6LaAws7xf1wIUarI0CaF06R

-- Dumped from database version 18.0 (Postgres.app)
-- Dumped by pg_dump version 18.0

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: generated_shopping_list; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.generated_shopping_list (
    id integer NOT NULL,
    product_name text,
    aisle_name text,
    recipe_count text,
    is_custom_product boolean,
    is_collected boolean DEFAULT false,
    quantity text
);


--
-- Name: generated_shopping_list_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

ALTER TABLE public.generated_shopping_list ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.generated_shopping_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: ingredients; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.ingredients (
    id integer NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: ingredients_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

ALTER TABLE public.ingredients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.ingredients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: recipe_ingredients; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.recipe_ingredients (
    recipe_id integer NOT NULL,
    ingredient_id integer NOT NULL,
    quantity numeric(6,2),
    unit character varying(50)
);


--
-- Name: recipe_tags; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.recipe_tags (
    tag_id integer NOT NULL,
    recipe_id integer NOT NULL
);


--
-- Name: recipes; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.recipes (
    id integer NOT NULL,
    title character varying(255),
    description text,
    instructions text,
    link_url text,
    prep_time_minutes integer,
    cook_time_minutes integer,
    is_on_menu boolean DEFAULT false
);


--
-- Name: recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

ALTER TABLE public.recipes ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.recipes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shopping_list; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.shopping_list (
    id integer NOT NULL,
    custom_product character varying(255),
    ingredient_name text
);


--
-- Name: shopping_list_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

ALTER TABLE public.shopping_list ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.shopping_list_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shopping_list_recipes; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.shopping_list_recipes (
    id integer NOT NULL,
    shopping_list_id integer,
    recipe_id integer
);


--
-- Name: shopping_list_recipes_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

CREATE SEQUENCE public.shopping_list_recipes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: shopping_list_recipes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: stuartbloxham
--

ALTER SEQUENCE public.shopping_list_recipes_id_seq OWNED BY public.shopping_list_recipes.id;


--
-- Name: tags; Type: TABLE; Schema: public; Owner: stuartbloxham
--

CREATE TABLE public.tags (
    id integer NOT NULL,
    name character varying(255) NOT NULL
);


--
-- Name: tags_id_seq; Type: SEQUENCE; Schema: public; Owner: stuartbloxham
--

ALTER TABLE public.tags ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.tags_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: shopping_list_recipes id; Type: DEFAULT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.shopping_list_recipes ALTER COLUMN id SET DEFAULT nextval('public.shopping_list_recipes_id_seq'::regclass);


--
-- Name: generated_shopping_list generated_shopping_list_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.generated_shopping_list
    ADD CONSTRAINT generated_shopping_list_pkey PRIMARY KEY (id);


--
-- Name: generated_shopping_list generated_shopping_list_product_name_key; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.generated_shopping_list
    ADD CONSTRAINT generated_shopping_list_product_name_key UNIQUE (product_name);


--
-- Name: ingredients ingredients_name_key; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_name_key UNIQUE (name);


--
-- Name: ingredients ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.ingredients
    ADD CONSTRAINT ingredients_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients recipe_ingredients_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT recipe_ingredients_pkey PRIMARY KEY (recipe_id, ingredient_id);


--
-- Name: recipe_tags recipe_tags_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_tags
    ADD CONSTRAINT recipe_tags_pkey PRIMARY KEY (recipe_id, tag_id);


--
-- Name: recipes recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipes
    ADD CONSTRAINT recipes_pkey PRIMARY KEY (id);


--
-- Name: shopping_list shopping_list_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.shopping_list
    ADD CONSTRAINT shopping_list_pkey PRIMARY KEY (id);


--
-- Name: shopping_list_recipes shopping_list_recipes_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.shopping_list_recipes
    ADD CONSTRAINT shopping_list_recipes_pkey PRIMARY KEY (id);


--
-- Name: tags tags_name_key; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_name_key UNIQUE (name);


--
-- Name: tags tags_pkey; Type: CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.tags
    ADD CONSTRAINT tags_pkey PRIMARY KEY (id);


--
-- Name: recipe_ingredients fk_ingredient; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT fk_ingredient FOREIGN KEY (ingredient_id) REFERENCES public.ingredients(id) ON DELETE CASCADE;


--
-- Name: recipe_ingredients fk_recipe; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT fk_recipe FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_tags fk_recipe; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_tags
    ADD CONSTRAINT fk_recipe FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_ingredients fk_recipes; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_ingredients
    ADD CONSTRAINT fk_recipes FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: recipe_tags fk_tag; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.recipe_tags
    ADD CONSTRAINT fk_tag FOREIGN KEY (tag_id) REFERENCES public.tags(id) ON DELETE CASCADE;


--
-- Name: shopping_list_recipes shopping_list_recipes_recipe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.shopping_list_recipes
    ADD CONSTRAINT shopping_list_recipes_recipe_id_fkey FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;


--
-- Name: shopping_list_recipes shopping_list_recipes_shopping_list_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: stuartbloxham
--

ALTER TABLE ONLY public.shopping_list_recipes
    ADD CONSTRAINT shopping_list_recipes_shopping_list_id_fkey FOREIGN KEY (shopping_list_id) REFERENCES public.shopping_list(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict H8seB7Pkw77psE54ZoaZ8BVz8LvIaJj5IO34RHXX6LaAws7xf1wIUarI0CaF06R

